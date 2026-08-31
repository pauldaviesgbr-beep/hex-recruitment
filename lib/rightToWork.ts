// THE ONE PLACE THE RIGHT-TO-WORK SENTENCE IS WRITTEN.
//
// jobs.work_authorization is a text[] and it already carries this exact string
// on 231 live adverts and 29 archived ones — every Goldenkeys row, set by their
// importer. Anything our own form writes has to be the SAME sentence or the
// board ends up with two wordings for one requirement, which is how a second
// copy starts.
//
// IT IS THE EMPLOYER'S STATEMENT, NOT OURS AND NOT A FACT ABOUT A CANDIDATE.
// Nothing here verifies anything: it records that an employer said the role
// needs someone who already has the right to work. The rendering says so.
//
// WHY A HELPER RATHER THAN A BARE CONSTANT: the interesting value is the EMPTY
// one. An employer who has not said anything must write [], so the advert
// renders nothing at all — absent stays absent, and a default here would be a
// claim only they can make. Having one function return both answers means the
// empty case cannot be forgotten at a call site.

export const RIGHT_TO_WORK_SENTENCE = 'Right to work in the UK required'

/** [] when they have not said so — which renders nothing on the advert. */
export function RIGHT_TO_WORK_VALUE(required: boolean): string[] {
  return required ? [RIGHT_TO_WORK_SENTENCE] : []
}
