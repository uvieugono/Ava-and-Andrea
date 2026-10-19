import React from 'react';
import { ContactForm } from '../components/ContactForm';

export const ContactScreen: React.FC = () => (
  <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
    <header>
      <h1 className="font-display text-3xl text-[#3E1B4A]">Contact Us</h1>
      <p className="text-sm text-[#5C4A68] mt-1">Send us a message and we will reply.</p>
    </header>
    <ContactForm />
  </div>
);
