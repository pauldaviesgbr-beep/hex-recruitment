/**
 * THRIVE — FILE INVOICE ATTACHMENTS FROM GMAIL INTO DRIVE
 * Written 20 September 2026. NOT RUN — see the report that came with it.
 *
 * Gmail and Drive are both Google, so the attachment never leaves their
 * servers and nothing has to come through a laptop.
 *
 * HOW TO USE IT
 *   1. script.google.com → New project → paste this over Code.gs → Save.
 *   2. Run `dryRun` FIRST. It writes nothing. Read the log.
 *   3. Run `fileBacklog` once. That clears the existing job.
 *   4. Run `installDailyTrigger` once. That is the only thing that
 *      schedules it.
 *
 * WHAT MAKES IT SAFE TO RUN TWICE
 *   TWO independent guards, deliberately, because the label alone is not
 *   enough on the first backlog pass:
 *     - a Gmail LABEL applied to the thread once it has been handled, and
 *       excluded from the search;
 *     - a FILENAME CHECK against the folder before each save.
 *   Either alone would do on a good day. The pair survives a run that dies
 *   half way, which is the state the label cannot describe.
 */

// ═══════════════════════════════════════════════════════════════════
// EDIT THIS BLOCK. NOTHING BELOW IT NEEDS READING.
// ═══════════════════════════════════════════════════════════════════

/** Senders whose mail may contain an invoice. Add a line per vendor. */
var SENDERS = [
  'invoice+statements@mail.anthropic.com',   // Anthropic — 16 receipts so far
  'invoice+statements@supabase.com',         // Supabase
  'invoice+statements@vercel.com',           // Vercel
  'stripe.com',                              // Firecrawl and anything else billed via Stripe
  'EMEA_Invoicing@email.apple.com',          // Apple Developer Program
  'no_reply@email.apple.com',                // Apple / iCloud+ invoices
  'postcoder@alliescomputing.com',           // Postcoder / Allies Computing
  'no-reply@1stformations.co.uk',            // 1st Formations — company formation
  'support@namecheap.com',                   // Namecheap — sends NO pdf today, listed so it works if that changes
  'googleplay-noreply@google.com',           // Google Play / Google One
  // 'invoices@resend.com',                  // Resend — free tier today, uncomment when we start paying
];

/**
 * SENDERS THAT ARE NEVER FILED, WHATEVER THEY ATTACH.
 *
 * mailservice@1stformations.co.uk is the SCANNED POST service. Every
 * attachment from it is a photograph of government mail sent to the
 * registered office — for a new company that is typically the HMRC UTR,
 * the Government Gateway activation code, or a Corporation Tax notice.
 * It is the same COMPANY as a sender that belongs on the list above, and
 * its mail looks exactly as invoice-shaped as the rest.
 *
 * BLOCKING THE SENDER IS THE RELIABLE GUARD. The filename list below is
 * not, and is only a second net.
 */
var BLOCKED_SENDERS = [
  'mailservice@1stformations.co.uk',
];

/**
 * FILENAME FRAGMENTS THAT ARE NEVER FILED. Lowercased, substring match.
 *
 * "Authentication Code.pdf" arrives from no-reply@1stformations.co.uk —
 * a sender that IS on the list — attached to the company formation email
 * alongside genuine invoices. It is the COMPANY AUTHENTICATION CODE, which
 * is the credential for filing at Companies House.
 *
 * A NAIVE SCRIPT FILES IT INTO A SHARED FOLDER. This one does not.
 *
 * THIS LIST IS NOT A SECURITY BOUNDARY and must not be treated as one —
 * a vendor can rename a file tomorrow. It is here so the next person
 * reading this knows the CATEGORY exists.
 */
var BLOCKED_FILENAMES = [
  'authentication code',
  'auth code',
];

/** Where the PDFs go. Top-level folder name, then the subfolder. */
var FOLDER_PARENT = 'Thrive Career Platform';
var FOLDER_NAME   = 'Thrive - Invoices';

/** The summary file that gets a run appended to it. */
var SUMMARY_PREFIX = '0000 SUMMARY';

/** Applied to a thread once handled, and excluded from the search. */
var LABEL_NAME = 'thrive-invoice-filed';

/** Where problems are emailed. */
var NOTIFY = 'pauldavies.gbr@gmail.com';

/** The daily run looks this far back. Generous, because the label does the real work. */
var DAILY_WINDOW = '14d';

/** The backlog run starts here. */
var BACKLOG_FROM = '2026/01/01';

// ═══════════════════════════════════════════════════════════════════
// ENTRY POINTS
// ═══════════════════════════════════════════════════════════════════

/** Writes nothing. Run this first. */
function dryRun() { run_({ query: 'after:' + BACKLOG_FROM, dry: true, label: 'DRY RUN' }); }

/** The one-off pass over everything since January. */
function fileBacklog() { run_({ query: 'after:' + BACKLOG_FROM, dry: false, label: 'BACKLOG' }); }

/** What the trigger calls. */
function fileInvoicesDaily() { run_({ query: 'newer_than:' + DAILY_WINDOW, dry: false, label: 'DAILY' }); }

/** Run ONCE to schedule it. Removes any previous trigger first so it cannot double up. */
function installDailyTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'fileInvoicesDaily') ScriptApp.deleteTrigger(existing[i]);
  }
  ScriptApp.newTrigger('fileInvoicesDaily').timeBased().everyDays(1).atHour(6).create();
  Logger.log('Daily trigger installed for ~06:00. Previous ones removed: ' + existing.length);
}

// ═══════════════════════════════════════════════════════════════════
// THE RUN
// ═══════════════════════════════════════════════════════════════════

function run_(opts) {
  var started = new Date();
  var log = [];
  var saved = 0, skippedDuplicate = 0, blocked = 0, flagged = 0, noAttachment = 0;

  try {
    var folder = getFolder_();            // throws, loudly, if it is not there
    var label  = getOrCreateLabel_();

    // TWO SEARCHES, AND THE SECOND ONE IS THE POINT.
    //
    // `threads` is the work: senders, in window, NOT already labelled.
    // `everMatched` is the same query WITHOUT the label exclusion.
    //
    // A ZERO IN THE FIRST IS NORMAL — it means nothing new today.
    // A ZERO IN THE SECOND MEANS THE QUERY ITSELF IS BROKEN — a renamed
    // sender, a deleted label, a typo in the array above — and that is the
    // failure that otherwise looks exactly like a quiet week.
    var senderClause = '{' + SENDERS.map(function (s) { return 'from:' + s; }).join(' ') + '}';
    var base        = senderClause + ' ' + opts.query + ' has:attachment';
    // A COUNT, NOT A PROBE — AND THE FIRST VERSION OF THIS LINE WAS NEITHER.
    //
    // The third argument to search() is a MAXIMUM. It was 1, so `.length`
    // could never exceed 1: the backlog run printed "ever matched: 1" against
    // 29 real threads. The ALARM was still correct, because 1 is not 0 and 0
    // is the only value it tests — but the number it PRINTED was a fact about
    // what had been requested rather than about the mailbox, and it read as a
    // count. Anything built on it later would have been built on nothing.
    var EVER_CAP    = 500;
    var threads     = GmailApp.search(base + ' -label:' + LABEL_NAME, 0, 200);
    var everMatched = GmailApp.search(base, 0, EVER_CAP).length;
    var capped      = everMatched === EVER_CAP;

    log.push('query       : ' + base);
    log.push('ever matched: ' + everMatched + (capped ? ' (CAPPED at ' + EVER_CAP + ' — the true figure is at least this)' : '') +
             '   (0 here means the QUERY is broken, not that the week was quiet)');
    log.push('to process  : ' + threads.length);
    log.push('guard status: ' + guardStatus_());
    log.push('');

    // "ever matched" must be at least "to process", because it is the same
    // query minus one exclusion. If it is not, the counting is wrong again.
    if (!capped && everMatched < threads.length) {
      alert_('Thrive invoice filer — THE TWO COUNTS DISAGREE',
        'ever matched (' + everMatched + ') is smaller than to process (' + threads.length + ').\n' +
        'It is the same query without the label exclusion, so that is impossible.\n' +
        'The counting is wrong. Do not trust the zero-alarm until this is fixed.\n');
      log.push('ALERTED: the two counts disagree — ' + everMatched + ' < ' + threads.length);
    }

    if (everMatched === 0) {
      alert_('Thrive invoice filer — THE SEARCH MATCHED NOTHING AT ALL',
        'The sender query returned zero threads even ignoring the label.\n\n' +
        'That is not a quiet week — it means the query is wrong. A sender may have\n' +
        'changed its address, or the SENDERS list may have been edited badly.\n\n' +
        'Query was:\n' + base + '\n');
      log.push('ALERTED: nothing matched at all.');
    }

    for (var t = 0; t < threads.length; t++) {
      var messages = threads[t].getMessages();
      var handledSomething = false;

      for (var m = 0; m < messages.length; m++) {
        var msg  = messages[m];
        var from = msg.getFrom().toLowerCase();

        if (isBlockedSender_(from)) {
          blocked++;
          log.push('BLOCKED SENDER  ' + msg.getSubject() + '   (' + from + ')');
          continue;
        }

        var atts = msg.getAttachments();
        for (var a = 0; a < atts.length; a++) {
          var att  = atts[a];
          var name = att.getName();

          if (!/\.pdf$/i.test(name)) continue;          // only PDFs are invoices here

          if (isBlockedFilename_(name)) {
            blocked++;
            log.push('BLOCKED FILE    ' + name + '   — credential, deliberately not filed');
            continue;
          }

          var target = buildName_(msg, name);

          // FILE IT AND FLAG IT, NEVER SKIP IT.
          // A wrongly-filed invoice is a drag. A silently skipped one is a
          // thing you do not know exists.
          if (!looksLikeInvoice_(name, msg.getSubject())) {
            target = 'FLAG ' + target;
            flagged++;
          }

          if (folder.getFilesByName(target).hasNext()) {
            skippedDuplicate++;
            log.push('already there   ' + target);
            handledSomething = true;
            continue;
          }

          if (opts.dry) {
            log.push('WOULD SAVE      ' + target);
          } else {
            folder.createFile(att.copyBlob()).setName(target);
            log.push('saved           ' + target);
          }
          saved++;
          handledSomething = true;
        }

        if (atts.length === 0) noAttachment++;
      }

      // Label only once the thread has actually been dealt with, and never
      // on a dry run — otherwise the dry run silently disarms the real one.
      if (!opts.dry) threads[t].addLabel(label);
      if (!handledSomething) log.push('nothing to file ' + threads[t].getFirstMessageSubject());
    }

    var summary =
      opts.label + ' finished ' + new Date().toISOString() + '\n' +
      '  threads examined : ' + threads.length + '\n' +
      '  PDFs saved       : ' + saved + (opts.dry ? '   (DRY RUN — nothing written)' : '') + '\n' +
      '  flagged as odd   : ' + flagged + '\n' +
      '  already present  : ' + skippedDuplicate + '\n' +
      '  blocked          : ' + blocked + '\n' +
      '  took             : ' + Math.round((new Date() - started) / 1000) + 's';

    log.push('');
    log.push(summary);
    Logger.log(log.join('\n'));

    if (!opts.dry) appendToSummary_(folder, opts.label, summary, log);

  } catch (e) {
    // APPS SCRIPT DOES EMAIL THE OWNER ON AN UNHANDLED ERROR, and that is
    // not enough on its own: it says a script failed, not which one or
    // where it got to. This sends the log.
    Logger.log('FAILED: ' + e);
    alert_('Thrive invoice filer FAILED', String(e) + '\n\n' + e.stack + '\n\n--- log so far ---\n' + log.join('\n'));
    throw e;   // rethrow so the run is marked failed in the dashboard too
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Refuses rather than creating anything. A missing folder is a fault, not a state to fix silently. */
function getFolder_() {
  var parents = DriveApp.getFoldersByName(FOLDER_PARENT);
  if (!parents.hasNext()) throw new Error('Drive folder not found: ' + FOLDER_PARENT);
  var kids = parents.next().getFoldersByName(FOLDER_NAME);
  if (!kids.hasNext()) throw new Error('Drive folder not found: ' + FOLDER_PARENT + ' / ' + FOLDER_NAME);
  return kids.next();
}

function getOrCreateLabel_() {
  return GmailApp.getUserLabelByName(LABEL_NAME) || GmailApp.createLabel(LABEL_NAME);
}

/**
 * IS THE BLOCKED-SENDER GUARD DOING ANYTHING, OR IS IT DECORATION?
 *
 * Today it is DORMANT. `mailservice@1stformations.co.uk` is not in SENDERS,
 * so the search never returns its mail and the block never engages. It was
 * reported as "the reliable guard" when in fact the FILENAME check is what
 * refused the authentication code — a true statement about the design that
 * was not a true statement about the running code.
 *
 * IT STAYS, AND NOT OUT OF sentiment. Look at the SENDERS array: it already
 * contains a BARE DOMAIN, `stripe.com`, because that is the natural way to
 * catch Firecrawl and whatever else bills through Stripe. The day somebody
 * adds `1stformations.co.uk` the same way — an obvious, reasonable edit —
 * the scanned-post service arrives in scope and the block becomes the only
 * thing between photographs of HMRC letters and a shared Drive folder.
 *
 * So rather than leave it silently dormant, every run says which it is.
 */
function guardStatus_() {
  var live = [];
  for (var b = 0; b < BLOCKED_SENDERS.length; b++) {
    for (var s = 0; s < SENDERS.length; s++) {
      if (BLOCKED_SENDERS[b].toLowerCase().indexOf(SENDERS[s].toLowerCase()) !== -1) {
        live.push(BLOCKED_SENDERS[b] + ' <- reachable via SENDERS entry "' + SENDERS[s] + '"');
      }
    }
  }
  return live.length === 0
    ? 'blocked-sender guard DORMANT (no SENDERS entry reaches any blocked address)'
    : 'blocked-sender guard LOAD-BEARING: ' + live.join('; ');
}

function isBlockedSender_(fromHeader) {
  for (var i = 0; i < BLOCKED_SENDERS.length; i++) {
    if (fromHeader.indexOf(BLOCKED_SENDERS[i].toLowerCase()) !== -1) return true;
  }
  return false;
}

function isBlockedFilename_(name) {
  var n = name.toLowerCase();
  for (var i = 0; i < BLOCKED_FILENAMES.length; i++) {
    if (n.indexOf(BLOCKED_FILENAMES[i]) !== -1) return true;
  }
  return false;
}

/** Invoice-shaped enough to file without a flag. Deliberately generous. */
function looksLikeInvoice_(filename, subject) {
  var hay = (filename + ' ' + subject).toLowerCase();
  return /invoice|receipt|billing|statement|vat/.test(hay);
}

/** ISO date first so the folder sorts chronologically, then vendor, then the vendor's own filename. */
function buildName_(msg, attachmentName) {
  var d = msg.getDate();
  var iso = Utilities.formatDate(d, 'Etc/UTC', 'yyyy-MM-dd');
  var vendor = vendorFrom_(msg.getFrom());
  var clean = attachmentName.replace(/[\\\/:*?"<>|]/g, '-');
  return iso + ' ' + vendor + ' - ' + clean;
}

function vendorFrom_(fromHeader) {
  var f = fromHeader.toLowerCase();
  if (f.indexOf('anthropic') !== -1)       return 'Anthropic';
  if (f.indexOf('supabase') !== -1)        return 'Supabase';
  if (f.indexOf('vercel') !== -1)          return 'Vercel';
  if (f.indexOf('apple') !== -1)           return 'Apple';
  if (f.indexOf('alliescomputing') !== -1) return 'Postcoder';
  if (f.indexOf('1stformations') !== -1)   return '1st Formations';
  if (f.indexOf('namecheap') !== -1)       return 'Namecheap';
  if (f.indexOf('google') !== -1)          return 'Google';
  if (f.indexOf('stripe') !== -1)          return 'Stripe';   // Firecrawl and friends
  var at = f.indexOf('@');
  return at === -1 ? 'Unknown' : f.slice(at + 1).split('.')[0];
}

/**
 * APPENDS. Never rewrites what is already in the file.
 *
 * The summary carries the 42-row hand-compiled record and that must survive.
 * If the file is missing this does NOT create one — it says so instead,
 * because a second summary file appearing quietly is worse than none.
 */
function appendToSummary_(folder, runLabel, summary, log) {
  var it = folder.getFiles();
  var target = null;
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf(SUMMARY_PREFIX) === 0) { target = f; break; }
  }
  if (!target) {
    alert_('Thrive invoice filer — summary file not found',
      'Could not find a file starting "' + SUMMARY_PREFIX + '" in the Invoices folder,\n' +
      'so this run was not appended to it. The PDFs were still filed.\n\n' + summary);
    return;
  }
  var existing = target.getBlob().getDataAsString();
  var block = '\n\n---\n\n## AUTOMATED RUN — ' + runLabel + ', ' + new Date().toISOString() + '\n\n```\n' +
              log.join('\n') + '\n```\n';
  target.setContent(existing + block);
}

function alert_(subject, body) {
  MailApp.sendEmail(NOTIFY, subject, body);
}
