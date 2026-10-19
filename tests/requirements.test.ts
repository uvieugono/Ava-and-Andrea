import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoundStore, emptyDb } from '../server/store.ts';
import { matchingTutorial, skillIsRequired, weeklyDrills } from '../src/lib/curriculum.ts';
import { Skill } from '../src/types.ts';

function skill(partial: Partial<Skill>): Skill {
  return partial as Skill;
}

test('a demonstration is hidden when the video title does not match the skill', () => {
  const unrelated = skill({
    name: 'Back handspring',
    tutorial: {
      videoId: 'abc12345',
      title: 'How to cook pasta',
      thumbnail: '',
      channelName: '',
      youtubeUrl: '',
      embedUrl: '',
    },
  });
  assert.equal(matchingTutorial(unrelated), null);

  const matched = skill({
    name: 'Back handspring',
    tutorial: {
      videoId: 'abc12345',
      title: 'Back handspring tutorial',
      thumbnail: '',
      channelName: '',
      youtubeUrl: '',
      embedUrl: '',
    },
  });
  assert.equal(matchingTutorial(matched)?.videoId, 'abc12345');
});

test('bars and beam are not required when the club has no apparatus', () => {
  const bars = skill({ category: 'BARS' });
  const beam = skill({ category: 'BEAM' });
  const floor = skill({ category: 'FLOOR' });
  assert.equal(skillIsRequired(bars, false, true), false);
  assert.equal(skillIsRequired(beam, true, false), false);
  assert.equal(skillIsRequired(floor, false, false), true);
});

test('conditioning videos change from one week to the next', () => {
  const first = weeklyDrills(new Date('2026-01-05T12:00:00Z'));
  const next = weeklyDrills(new Date('2026-01-12T12:00:00Z'));
  assert.notEqual(first.drills[0]?.videoUrl, next.drills[0]?.videoUrl);
  assert.ok(first.drills[0]?.videoUrl);
  assert.ok(next.drills[0]?.videoUrl);
});

test('abusive comments are held and a block hides the video', async () => {
  const store = createBoundStore(emptyDb(), async () => {});
  const author = await store.signupStudent({
    name: 'Ada Gymnast',
    email: 'ada@gym.test',
    password: 'correct-horse',
    dateOfBirth: '2000-01-01',
  });
  const viewer = await store.signupStudent({
    name: 'Bola Gymnast',
    email: 'bola@gym.test',
    password: 'correct-horse',
    dateOfBirth: '2000-01-01',
  });
  const authorRecord = await store.userByToken(author.token);
  const viewerRecord = await store.userByToken(viewer.token);
  assert.ok(authorRecord && viewerRecord);
  const clip = await store.saveUpload({ ownerId: authorRecord.id, clubId: null, scope: 'public', mime: 'video/mp4', name: 'clip.mp4', size: 3, file: 'clip.mp4' });
  const post = await store.createPost(authorRecord, {
    videoUrl: `/api/uploads/${clip.id}`,
    caption: 'First attempt',
    skill: 'Back handspring',
    category: 'Floor',
    visibility: 'everyone',
  });
  await assert.rejects(
    store.comment(viewerRecord, post.id, 'you are an idiot', null),
    /HELD/,
  );
  const visible = store.listPosts(authorRecord, 'All').find((item) => item.id === post.id);
  assert.equal(visible?.comments.length, 0);

  await store.blockUser(viewerRecord, authorRecord.id);
  const hidden = store.listPosts(viewerRecord, 'All');
  assert.equal(hidden.some((item) => item.id === post.id), false);
});
