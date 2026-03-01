# Hospitality Hive - Next.js Setup Guide

## 🎉 Your New Modern Recruitment Platform!

This is a complete rebuild of your Hospitality Hive website using:
- ✅ **Next.js 14** - Modern React framework
- ✅ **TypeScript** - Type safety
- ✅ **Supabase** - Your existing backend (already set up!)
- ✅ **Responsive Design** - Works on all devices

---

## 📦 What's Included

### Pages
- **Home** (`/`) - Hero section with your yellow/black design
- **Login** (`/login`) - User authentication
- **Register Employee** (`/register/employee`) - Job seeker signup
- **Register Employer** (`/register/employer`) - Employer signup (to be completed)
- **Jobs** - Browse/search jobs (to be added)
- **Dashboard** - User dashboard (to be added)

### Components
- **Header** - Sticky navigation with auth state
- **Supabase Client** - Pre-configured database connection

### Features Working
- ✅ User registration (employees)
- ✅ Login/logout
- ✅ Password confirmation
- ✅ Supabase integration
- ✅ Email verification ready
- ✅ Your black/yellow color scheme
- ✅ Responsive design

---

## 🚀 Quick Setup (10 Minutes)

### Step 1: Install Dependencies

```bash
cd hospitality-hive-nextjs
npm install
```

### Step 2: Configure Supabase

1. **Create `.env.local` file** in the root directory
2. **Copy these lines and add YOUR credentials:**

```env
NEXT_PUBLIC_SUPABASE_URL=https://tnnyporpioafuokqtkbu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Get your credentials from: https://app.supabase.com/project/_/settings/api

### Step 3: Run the Development Server

```bash
npm run dev
```

Open http://localhost:3000 in your browser! 🎉

---

## 🎨 Easy Customization

### Change Colors

Edit `app/globals.css` lines 1-10:

```css
:root {
  --primary-yellow: #FFCC00;  /* Change this! */
  --hover-yellow: #FFB800;
  --black: #000000;
  /* etc... */
}
```

### Change Name/Branding

1. **Logo:** Edit `components/Header.tsx` line 36
2. **Title:** Edit `app/layout.tsx` line 10
3. **Hero text:** Edit `app/page.tsx` lines 14-17

### Remove Sections

Just delete or comment out sections in `app/page.tsx`

---

## 📁 Project Structure

```
hospitality-hive-nextjs/
├── app/
│   ├── page.tsx              # Home page
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Global styles
│   ├── login/
│   │   └── page.tsx          # Login page
│   └── register/
│       ├── employee/
│       │   └── page.tsx      # Employee signup
│       └── employer/
│           └── page.tsx      # Employer signup (TODO)
├── components/
│   ├── Header.tsx            # Navigation header
│   └── Header.module.css
├── lib/
│   └── supabase.ts           # Supabase client
├── package.json
├── tsconfig.json
└── .env.local                # Your credentials (create this!)
```

---

## ✅ What Works Now

1. **Home page** - Your hero section and feature cards
2. **Login** - Full authentication
3. **Employee registration** - Creates user + profile in Supabase
4. **Header navigation** - Shows different options when logged in
5. **Supabase backend** - All connected to your existing database

---

## 📋 Next Steps (What to Add)

### High Priority
1. **Jobs Page** - Browse and search jobs
2. **Employer Registration** - Complete employer signup
3. **Dashboard** - User dashboard (employee/employer views)
4. **Job Posting** - Create/edit jobs (employers)

### Medium Priority
5. **Profile Pages** - View/edit employee profiles
6. **CV Upload** - File upload to Supabase storage
7. **Applications** - Apply for jobs
8. **Search/Filters** - Job search functionality

### Low Priority
9. **Messaging** - User-to-user chat
10. **Admin Panel** - Admin dashboard
11. **Email Templates** - Custom verification emails
12. **Password Reset** - Forgot password flow

---

## 🔧 Common Commands

```bash
# Development
npm run dev          # Start dev server

# Production
npm run build        # Build for production
npm run start        # Run production server

# Code Quality
npm run lint         # Check for errors
```

---

## 🐛 Troubleshooting

### "Module not found"
Run: `npm install`

### "Invalid Supabase URL"
Check your `.env.local` file has the correct credentials

### Page not loading
Make sure dev server is running: `npm run dev`

### Styles not updating
Hard refresh browser: Ctrl+Shift+R

---

## 🎯 Customization Guide

### 1. Change Color Scheme

**File:** `app/globals.css`

```css
:root {
  --primary-yellow: #YOUR_COLOR;
  --hover-yellow: #YOUR_HOVER_COLOR;
}
```

### 2. Change Site Name

**File:** `components/Header.tsx` (line 36)
```tsx
<span className={styles.logoText}>YOUR NAME HERE</span>
```

**File:** `app/layout.tsx` (line 10)
```tsx
title: 'Your Name - UK Hospitality Jobs',
```

### 3. Remove a Section

**File:** `app/page.tsx`

Just delete or comment out the section you don't want:
```tsx
{/* <section className={styles.features}>
  ... section content ...
</section> */}
```

---

## 📱 It's Responsive!

Your site works perfectly on:
- 💻 Desktop
- 📱 Mobile
- 📲 Tablet

---

## 🚀 Deploy to Production

### Vercel (Recommended - Free)

1. Push code to GitHub
2. Go to https://vercel.com
3. Import your repository
4. Add environment variables (Supabase URL & Key)
5. Deploy! (takes 2 minutes)

### Other Options
- Netlify
- Railway
- Your own server

---

## 🆘 Need Help?

1. Check this README
2. Look at code comments
3. Check Supabase dashboard for errors
4. Ask me! I'm here to help

---

## 🎉 You're All Set!

Your modern, professional recruitment platform is ready!

**Current state:** Foundation complete, ready for customization
**Time to get running:** 10 minutes
**Difficulty:** Easy - just follow the steps above

Enjoy your new Next.js app! 🚀
