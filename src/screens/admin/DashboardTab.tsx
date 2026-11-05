import React from 'react';
import { adminApi } from '../../services/adminApi';
import { Card, day, dayTime, Loading, Table, Tile, useLoad } from './adminUi';

const ROLE: Record<string, string> = { GYMNAST: 'Gymnast', CLUB_ADMIN: 'Club administrator', COACH: 'Coach', ADMIN: 'Administrator' };

export const DashboardTab: React.FC = () => {
  const { data, error } = useLoad(adminApi.dashboard);
  if (!data) return <Loading error={error} />;
  const { users, clubs, activity } = data;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Accounts in use" value={users.total} hint={`${users.suspended} suspended`} />
        <Tile label="Gymnasts" value={users.gymnasts} />
        <Tile label="Clubs" value={clubs.total} hint={`${clubs.approved} approved`} />
        <Tile label="Clubs waiting" value={clubs.waiting} hint={clubs.waiting ? 'Open the Clubs tab to decide' : 'Nothing to decide'} />
        <Tile label="New in 7 days" value={users.newLast7Days} hint={`${users.newLast30Days} in 30 days`} />
        <Tile label="Signed in, 7 days" value={users.signedInLast7Days} />
        <Tile label="Connect videos" value={activity.videos} hint={`Comments: ${activity.comments}. Likes: ${activity.likes}.`} />
        <Tile label="Reports to review" value={activity.openReports} />
      </div>
      <p className="text-xs text-[#5C4A68]">Registration and sign-in dates are only known from the day this Admin area went live, so older accounts do not count in the “new” and “signed in” figures.</p>
      <Card title="Skill videos">
        <p>{activity.skillVideosWaiting} waiting for a club to review. {activity.skillVideosApproved} approved so far.</p>
      </Card>
      <Card title="Latest registrations">
        {data.recentRegistrations.length === 0 ? <p className="text-[#5C4A68]">None recorded yet.</p> : (
          <Table head={['Name', 'Account', 'Club', 'Registered']}>
            {data.recentRegistrations.map((row, index) => (
              <tr key={`${row.name}-${index}`} className="border-b border-[#F4EEF8]">
                <td className="py-2 pr-3">{row.name}</td>
                <td className="py-2 pr-3">{ROLE[row.role] ?? row.role}</td>
                <td className="py-2 pr-3">{row.clubName ?? '—'}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{day(row.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title="Latest administrator actions">
        {data.recentAdminActions.length === 0 ? <p className="text-[#5C4A68]">Nothing yet.</p> : (
          <ul className="space-y-1">
            {data.recentAdminActions.map((row) => (
              <li key={row.id}><span className="text-[#5C4A68]">{dayTime(row.at)} · {row.by}:</span> {row.action} · {row.target}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
