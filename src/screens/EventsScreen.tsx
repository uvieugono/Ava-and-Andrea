import React, { useEffect, useState } from 'react';
import { gymApi, mediaUrl, PlatformEventView } from '../services/gymApi';

const longDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Events published in Admin. */
export const EventsScreen: React.FC = () => {
  const [events, setEvents] = useState<PlatformEventView[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    gymApi.platformEvents().then((result) => setEvents(result.events)).catch(() => setFailed(true));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events?.filter((item) => (item.endDate || item.date) >= today).length ?? 0;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <header>
        <h1 className="font-display text-3xl text-[#3E1B4A]">Events</h1>
        {events && <p className="text-sm text-[#5C4A68] mt-1">{upcoming === 0 ? 'No upcoming events are listed.' : upcoming === 1 ? 'One upcoming event is listed.' : `${upcoming} upcoming events are listed.`}</p>}
      </header>
      {failed && <p className="text-sm text-red-600" role="alert">The events could not be loaded. Try again.</p>}
      {events?.map((item) => {
        const past = (item.endDate || item.date) < today;
        return (
          <article key={item.id} className={`bg-white border border-[#E4D7EE] rounded-2xl overflow-hidden ${past ? 'opacity-70' : ''}`}>
            {item.imageUrl && <img src={mediaUrl(item.imageUrl)} alt={`${item.name} flyer`} className="w-full h-auto block" />}
            <div className="p-5 space-y-2 text-sm text-[#241628]">
              <h2 className="font-display text-2xl text-[#3E1B4A]">{item.name}</h2>
              {past && <p className="text-xs font-semibold text-[#5C4A68]">This event has finished.</p>}
              <p>{longDate(item.date)}{item.endDate ? ` to ${longDate(item.endDate)}` : ''}{item.time ? `, ${item.time}` : ''}</p>
              {(item.venue || item.city) && <p>{[item.venue, item.city].filter(Boolean).join(', ')}</p>}
              {item.organiser && <p>{item.organiser}</p>}
              {item.description && <p className="whitespace-pre-wrap">{item.description}</p>}
              {item.entryInfo && <p>{item.entryInfo}</p>}
              {item.website && (
                <p>
                  <a href={item.website} target="_blank" rel="noreferrer" className="text-[#5C2A6E] underline">Visit the {item.name} website</a>
                </p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
};
