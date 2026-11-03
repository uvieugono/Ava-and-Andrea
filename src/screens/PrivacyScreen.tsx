import React from 'react';
import { ContactForm } from '../components/ContactForm';
import { Logo } from '../components/Logo';
import { SUPPORT_WHATSAPP_DISPLAY, SUPPORT_WHATSAPP_INTERNATIONAL } from '../lib/support';

export const PRIVACY_UPDATED = '3 November 2026';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-2">
    <h2 className="font-display text-xl text-[#3E1B4A]">{title}</h2>
    {children}
  </section>
);

/** Open to everyone at /privacy, signed in or not. Keep it true to what the app does. */
export const PrivacyScreen: React.FC = () => (
  <div className="min-h-screen bg-[#F7F4FB] text-[#241628]">
    <header className="bg-white border-b border-[#E4D7EE]">
      <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
        <a href="/" aria-label="GymTrack home"><Logo /></a>
        <a href="/" className="text-sm text-[#5C2A6E] underline">Back to GymTrack</a>
      </div>
    </header>
    <main className="max-w-3xl mx-auto px-4 py-6 space-y-6 text-sm leading-relaxed">
      <div>
        <h1 className="font-display text-3xl text-[#3E1B4A]">Privacy Policy</h1>
        <p className="text-xs text-[#5C4A68] mt-1">Last updated {PRIVACY_UPDATED}</p>
      </div>

      <p>
        GymTrack helps gymnasts and gymnastics clubs in Nigeria track skills and progress. Many of our users are children, so we keep what we collect to what the app needs. This page explains what we hold, why, who can see it, and what you can ask us to do.
      </p>

      <Section title="Children and parents">
        <p>
          If you are under 18, please read this page with a parent or guardian. They must agree before you register. When a club adds a gymnast, the club confirms that the gymnast’s parent or guardian has agreed. A parent or guardian can contact us at any time to see, correct or delete a child’s information.
        </p>
      </Section>

      <Section title="What we collect">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Your account:</strong> name, email, telephone number and password. We keep only a scrambled form of the password, so nobody at GymTrack can read it.</li>
          <li><strong>Gymnasts:</strong> date of birth, level and the club you chose.</li>
          <li><strong>Clubs:</strong> the club’s name and city, the name and contact details of its administrator and coaches, and its logo and signature if added.</li>
          <li><strong>Training records:</strong> skill videos, your club’s comments and decisions, attendance, drills, competition results and certificates.</li>
          <li><strong>Connect:</strong> videos you publish, captions, comments, likes, saves, follows, blocks and reports.</li>
          <li><strong>Club paperwork:</strong> documents a club uploads, fee reminders it sends, and records of subscription payments.</li>
          <li><strong>Messages to us:</strong> what you send through the Contact Us form, with your name and telephone number.</li>
          <li><strong>A profile photo</strong>, if you add one, stays on your own device and is not sent to us.</li>
        </ul>
      </Section>

      <Section title="Why we use it">
        <ul className="list-disc pl-5 space-y-1">
          <li>To run your account and show your skills and level.</li>
          <li>To let your club review your videos and manage its gymnasts. Your level only changes when your club has approved every required skill.</li>
          <li>To show videos on Connect to the people you chose.</li>
          <li>To send fee reminders from your club on WhatsApp, and to answer your messages.</li>
          <li>To check new clubs before gymnasts can choose them, to check club payments, and to keep GymTrack safe.</li>
        </ul>
        <p>We use this information because you or your parent or guardian agreed to it, and because we need it to provide the service. We do not sell it and we do not show adverts.</p>
      </Section>

      <Section title="Who can see it">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>The club you belong to or choose:</strong> its administrator and coaches can see your name, email, telephone number, date of birth, level, skill videos and training records. Choose a club you trust.</li>
          <li><strong>Your skill videos</strong> are private to you and that club.</li>
          <li><strong>Connect videos marked “All Clubs”</strong> can be seen by anyone signed in to GymTrack, including people you do not know. “Specific Club” videos can be seen only by that club. Your age and level show only if you tick the boxes.</li>
          <li><strong>The GymTrack team</strong> can see account and club records when we need to run or check the service.</li>
        </ul>
      </Section>

      <Section title="Companies that help us">
        <p>We share only what each one needs to do its job:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Google:</strong> hosts the app and database (Google Cloud), and stores uploaded videos and documents in a private Google Drive folder. Page fonts also load from Google.</li>
          <li><strong>SolyntaFlow:</strong> receives Contact Us messages, and sends WhatsApp fee reminders with the gymnast’s name and telephone number, the club’s name and the message.</li>
          <li><strong>Meta (WhatsApp):</strong> delivers those WhatsApp messages.</li>
          <li><strong>YouTube:</strong> plays the skill demonstration videos. YouTube may collect information when you play one, under Google’s own privacy policy.</li>
        </ul>
        <p>Some of these companies keep information outside Nigeria, including in the United States. We use them because they run the service securely and reliably.</p>
      </Section>

      <Section title="Keeping it safe, and for how long">
        <p>Files are served only after GymTrack checks who is asking, and uploaded files are not shared publicly on Google Drive. No system is perfectly secure, so please use a strong password and do not share it. If something goes wrong that puts your information at risk, we will tell you and the regulator where the law requires it.</p>
        <p>We keep your information while your account is open. If you ask us to delete your account, we delete your information unless the law requires us to keep part of it, such as payment records. Deleted videos are removed from storage.</p>
      </Section>

      <Section title="Your rights">
        <p>
          Under the Nigeria Data Protection Act 2023 you can ask us to show you what we hold, correct it, delete it, or stop using it, and you can withdraw your agreement at any time. You or your parent or guardian can also complain to the Nigeria Data Protection Commission. Some of this you can do yourself: you can edit your profile, delete your Connect videos, delete a skill video still waiting for review, and block other users.
        </p>
      </Section>

      <Section title="This browser">
        <p>GymTrack remembers your sign-in until you close the tab, and keeps a few settings on your device, such as your profile photo. We do not use advertising or tracking cookies.</p>
      </Section>

      <Section title="Changes to this policy">
        <p>If we change this policy we will update the date at the top, and tell you in the app if the change is significant.</p>
      </Section>

      <Section title="Contact us">
        <p>
          For any privacy request, message us on WhatsApp at{' '}
          <a className="text-[#5C2A6E] underline" href={`https://wa.me/${SUPPORT_WHATSAPP_INTERNATIONAL}`} target="_blank" rel="noopener noreferrer">{SUPPORT_WHATSAPP_DISPLAY}</a>{' '}
          or use this form.
        </p>
        <ContactForm />
      </Section>
    </main>
  </div>
);
