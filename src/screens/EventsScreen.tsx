import React from 'react';
import { PublicImage } from '../components/PublicImage';

// The flyer is kept at public/events/gymfest-flyer.jpeg (.jpg and .png also work).
export const EventsScreen: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <header>
        <h1 className="font-display text-3xl text-[#3E1B4A]">Events</h1>
        <p className="text-sm text-[#5C4A68] mt-1">One event is listed.</p>
      </header>
      <article className="bg-white border border-[#E4D7EE] rounded-2xl overflow-hidden">
        <PublicImage
          base="/events/gymfest-flyer"
          alt="GymFest 3.0 flyer"
          className="w-full h-auto block"
          fallback={
            <div className="bg-[#F4EEF8] px-5 py-10 text-center">
              <p className="font-display text-2xl text-[#3E1B4A]">GymFest 3.0 flyer</p>
              <p className="text-sm text-[#5C4A68] mt-2 max-w-md mx-auto">
                The official flyer is not in the project. Send the flyer image from gymfestchampionship.com and it will be shown here. A different picture is not used in its place.
              </p>
            </div>
          }
        />
        <div className="p-5 space-y-2 text-sm text-[#241628]">
          <h2 className="font-display text-2xl text-[#3E1B4A]">GymFest 3.0</h2>
          <p>Saturday 7 November 2026</p>
          <p>The Dome, Freedom Way, Lekki Phase 1, Lagos</p>
          <p>Convened by Tee Tumblers Gymnastics Club and the Society for the Performing Arts in Nigeria.</p>
          <p>Published gymnast entry is ₦20,000. Spectator entry is ₦5,000.</p>
        </div>
      </article>
    </div>
  );
};
