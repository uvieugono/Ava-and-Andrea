import React from 'react';
import { adminApi } from '../../services/adminApi';
import { Card, day, Loading, Table, Tile, useLoad } from './adminUi';

const APPROVAL: Record<string, string> = { approved: 'Approved', pending: 'Waiting', rejected: 'Not approved' };

const Cell: React.FC<{ children: React.ReactNode }> = ({ children }) => <td className="py-2 pr-3 whitespace-nowrap">{children}</td>;

export const ReportsTab: React.FC = () => {
  const { data, error } = useLoad(adminApi.reports);
  if (!data) return <Loading error={error} />;
  const sum = (key: 'gymnasts' | 'clubs' | 'videos' | 'skillVideos' | 'comments') => data.weeks.reduce((total, week) => total + week[key], 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="New gymnasts, 8 weeks" value={sum('gymnasts')} />
        <Tile label="New clubs, 8 weeks" value={sum('clubs')} />
        <Tile label="Connect videos, 8 weeks" value={sum('videos')} />
        <Tile label="Signed in, 30 days" value={data.activeLast30Days} />
      </div>
      {data.accountsFromBeforeTracking > 0 && (
        <p className="text-xs text-[#5C4A68]">{data.accountsFromBeforeTracking} accounts were made before GymTrack started recording registration dates, so they are not in the weekly figures.</p>
      )}
      <Card title="Growth and engagement, week by week">
        <Table head={['Week ending', 'New gymnasts', 'New clubs', 'Connect videos', 'Skill videos', 'Comments']}>
          {data.weeks.map((week) => (
            <tr key={week.weekEnding} className="border-b border-[#F4EEF8]">
              <Cell>{day(week.weekEnding)}</Cell>
              <Cell>{week.gymnasts}</Cell>
              <Cell>{week.clubs}</Cell>
              <Cell>{week.videos}</Cell>
              <Cell>{week.skillVideos}</Cell>
              <Cell>{week.comments}</Cell>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Club activity, last 30 days">
        {data.clubs.length === 0 ? <p className="text-[#5C4A68]">No clubs yet.</p> : (
          <Table head={['Club', 'State', 'Gymnasts', 'Coaches', 'Skill videos', 'Reviews', 'Attendance marks', 'Notices, all time', 'Paid until']}>
            {data.clubs.map((club) => (
              <tr key={club.id} className="border-b border-[#F4EEF8]">
                <Cell>{club.name}</Cell>
                <Cell>{APPROVAL[club.approval] ?? club.approval}</Cell>
                <Cell>{club.gymnasts}</Cell>
                <Cell>{club.coaches}</Cell>
                <Cell>{club.skillVideos30Days}</Cell>
                <Cell>{club.decisions30Days}</Cell>
                <Cell>{club.attendance30Days}</Cell>
                <Cell>{club.notices}</Cell>
                <Cell>{day(club.paidUntil)}</Cell>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
};
