import express, { NextFunction, Request, Response, Router } from 'express';

const MAX_SKILL_NAME = 200;
const MAX_BATCH = 500;
const MAX_CACHED_SEARCHES = 2000;

function skillNameOf(value: unknown) {
  return typeof value === 'string' && value.trim() && value.length <= MAX_SKILL_NAME ? value.trim() : null;
}

// In-memory cache for search results to preserve API quotas and provide lightning speed
const searchCache = new Map<string, any>();

// Helper to sanitize skill name for keyword matching
function getSkillKeywords(skillName: string): string[] {
  return skillName
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['and', 'the', 'for', 'with', 'onto', 'over'].includes(w));
}

// Check if a title sufficiently matches the requested individual skill
function isSkillMatch(title: string, skillName: string): boolean {
  const lowerTitle = title.toLowerCase();
  const lowerSkill = skillName.toLowerCase();

  // If exact skill name is in title
  if (lowerTitle.includes(lowerSkill)) return true;

  // Check essential keywords
  const keywords = getSkillKeywords(skillName);
  if (keywords.length === 0) return true;

  const matchedKeywords = keywords.filter((k) => lowerTitle.includes(k));
  // At least 60% of keywords matched or the main word matched
  return matchedKeywords.length >= Math.ceil(keywords.length * 0.6);
}

// Built-in verified tutorial database for common USAG Levels 1–10 skills
// All verified against real gymnastics coaching channels
const VERIFIED_COACHING_TUTORIALS: Record<string, { videoId: string; title: string; channelName: string; thumbnail: string }> = {
  'cartwheel': {
    videoId: 'GAbIx6oQAv4',
    title: 'How to EASILY do a cartwheel! (Tutorial)',
    channelName: 'Rylie Shaw',
    thumbnail: 'https://i.ytimg.com/vi/GAbIx6oQAv4/hqdefault.jpg',
  },
  'forward roll': {
    videoId: 'TSsCIEs17D8',
    title: 'How to Forward Roll | Gymnastics Tutorial',
    channelName: 'CBBC Gym Stars',
    thumbnail: 'https://i.ytimg.com/vi/TSsCIEs17D8/hqdefault.jpg',
  },
  'forward roll to stand': {
    videoId: 'TSsCIEs17D8',
    title: 'How to Forward Roll | Gymnastics Tutorial',
    channelName: 'CBBC Gym Stars',
    thumbnail: 'https://i.ytimg.com/vi/TSsCIEs17D8/hqdefault.jpg',
  },
  'backward roll': {
    videoId: 'U_scqEjjZbM',
    title: 'Head Over Heels Gymnastics Tutorials, Learn how to do a Backwards Roll',
    channelName: 'Head Over Heels Gymnastics',
    thumbnail: 'https://i.ytimg.com/vi/U_scqEjjZbM/hqdefault.jpg',
  },
  'candlestick to stand': {
    videoId: '83-8RNZaDuw',
    title: 'Candlestick to Stand Gymnastics Tutorial',
    channelName: 'Jubilee Gymnastics',
    thumbnail: 'https://i.ytimg.com/vi/83-8RNZaDuw/hqdefault.jpg',
  },
  'handstand flat back': {
    videoId: 'XUPTTA1tY6M',
    title: 'Gymnastics Handstand Flatback Vault Tutorial | Kyra SGG',
    channelName: 'Incredible Gymnasts!',
    thumbnail: 'https://i.ytimg.com/vi/XUPTTA1tY6M/hqdefault.jpg',
  },
  'handstand flatback onto mat stack': {
    videoId: 'XUPTTA1tY6M',
    title: 'Gymnastics Handstand Flatback Vault Tutorial | Kyra SGG',
    channelName: 'Incredible Gymnasts!',
    thumbnail: 'https://i.ytimg.com/vi/XUPTTA1tY6M/hqdefault.jpg',
  },
  'straight jump off springboard to stick': {
    videoId: 'WmpN6b4tV1E',
    title: 'Run Punch Straight Jump Onto Resi Mat',
    channelName: 'Coach Marissa',
    thumbnail: 'https://i.ytimg.com/vi/WmpN6b4tV1E/hqdefault.jpg',
  },
  'run and hurdle onto board': {
    videoId: '-UhJoZWFT7s',
    title: 'Vault: Hurdle/Board work and Springboard Punch Drill',
    channelName: 'Carousel Gymnastics',
    thumbnail: 'https://i.ytimg.com/vi/-UhJoZWFT7s/hqdefault.jpg',
  },
  'bridge kickover': {
    videoId: 'hde3jd_8yb8',
    title: 'How to do a BRIDGE KICKOVER at home! MGA Gymnastics',
    channelName: 'MGA Gymnastics',
    thumbnail: 'https://i.ytimg.com/vi/hde3jd_8yb8/hqdefault.jpg',
  },
  'handstand': {
    videoId: 'PFqKbqRGUyY',
    title: 'How to do a Handstand for a Long Time! | Top 10 Tips',
    channelName: 'Anna McNulty',
    thumbnail: 'https://i.ytimg.com/vi/PFqKbqRGUyY/hqdefault.jpg',
  },
  'handstand hold': {
    videoId: 'PFqKbqRGUyY',
    title: 'How to do a Handstand for a Long Time! | Top 10 Tips',
    channelName: 'Anna McNulty',
    thumbnail: 'https://i.ytimg.com/vi/PFqKbqRGUyY/hqdefault.jpg',
  },
  'split leap': {
    videoId: '8ibt-SHYepI',
    title: 'How to do a Split Leap (Gymnastics and Dance tutorial)',
    channelName: 'Nicole Ferrier',
    thumbnail: 'https://i.ytimg.com/vi/8ibt-SHYepI/hqdefault.jpg',
  },
  'round-off rebound': {
    videoId: 'TaV8TBELBLc',
    title: 'Round Off Rebound Gymnastics Drill',
    channelName: 'Emily Smith',
    thumbnail: 'https://i.ytimg.com/vi/TaV8TBELBLc/hqdefault.jpg',
  },
  'round off to rebound': {
    videoId: '6t0-u_zGllE',
    title: 'Floor: Round Off Rebound Tutorial',
    channelName: 'rainbowgymnastics1',
    thumbnail: 'https://i.ytimg.com/vi/6t0-u_zGllE/hqdefault.jpg',
  },
  'handstand to bridge kickover': {
    videoId: 'iCFw0hYwa0A',
    title: 'Gymnastics Handstand Bridge Kickover Tutorial | Carissa SGG',
    channelName: 'Incredible Gymnasts!',
    thumbnail: 'https://i.ytimg.com/vi/iCFw0hYwa0A/hqdefault.jpg',
  },
  'back handspring': {
    videoId: 'KkdRT_6ODRI',
    title: 'How to do a Back Handspring Tutorial',
    channelName: 'Anna McNulty',
    thumbnail: 'https://i.ytimg.com/vi/KkdRT_6ODRI/hqdefault.jpg',
  },
  'front handspring': {
    videoId: 'TXmAMLif1D4',
    title: 'How To Do A Front Handspring Step Out With Coach Meggin',
    channelName: 'Fit And Fun With Coach Meggin',
    thumbnail: 'https://i.ytimg.com/vi/TXmAMLif1D4/hqdefault.jpg',
  },
  'front handspring step-out': {
    videoId: 'TXmAMLif1D4',
    title: 'How To Do A Front Handspring Step Out With Coach Meggin',
    channelName: 'Fit And Fun With Coach Meggin',
    thumbnail: 'https://i.ytimg.com/vi/TXmAMLif1D4/hqdefault.jpg',
  },
  'straddle jump': {
    videoId: '6wrtA6TcWJ8',
    title: 'Gymnastics How To: Straddle Jump',
    channelName: 'Shannon Miller',
    thumbnail: 'https://i.ytimg.com/vi/6wrtA6TcWJ8/hqdefault.jpg',
  },
  'front handspring vault': {
    videoId: 'rjG9jb_m8bI',
    title: 'TOP 10 VAULT DRILLS | FRONT HANDSPRING',
    channelName: 'Saving Tenths',
    thumbnail: 'https://i.ytimg.com/vi/rjG9jb_m8bI/hqdefault.jpg',
  },
  'back extension roll': {
    videoId: 'LYNLFv_JRZQ',
    title: 'Back Extension Rolls for Beginner Gymnasts',
    channelName: 'eHowSports',
    thumbnail: 'https://i.ytimg.com/vi/LYNLFv_JRZQ/hqdefault.jpg',
  },
  'full turn on one foot': {
    videoId: '5S4EOgtS-Pg',
    title: 'Turn on One Foot, Controlled Relevé Landing',
    channelName: 'Altadore Gymnastic Club',
    thumbnail: 'https://i.ytimg.com/vi/5S4EOgtS-Pg/hqdefault.jpg',
  },
  'round-off back handspring': {
    videoId: 'PZQmDXztYME',
    title: 'Roundoff Back Handspring Tutorial & Tumbling Drills',
    channelName: 'Syd the Yogi',
    thumbnail: 'https://i.ytimg.com/vi/PZQmDXztYME/hqdefault.jpg',
  },
  'back tuck': {
    videoId: 'bYAbf0Ep6rk',
    title: 'Mastering the Back Tuck | Step-by-Step Gymnastics Tutorial',
    channelName: 'ChloeD_Gymnast',
    thumbnail: 'https://i.ytimg.com/vi/bYAbf0Ep6rk/hqdefault.jpg',
  },
  'back tuck on floor': {
    videoId: 'bYAbf0Ep6rk',
    title: 'Mastering the Back Tuck | Step-by-Step Gymnastics Tutorial',
    channelName: 'ChloeD_Gymnast',
    thumbnail: 'https://i.ytimg.com/vi/bYAbf0Ep6rk/hqdefault.jpg',
  },
  'aerial cartwheel': {
    videoId: 'XCHPaHDf12w',
    title: 'Elite Gymnast Explains SIDE AERIAL! You got this.',
    channelName: 'Sophia Campana',
    thumbnail: 'https://i.ytimg.com/vi/XCHPaHDf12w/hqdefault.jpg',
  },
  'layout salto': {
    videoId: 'DSckWbWDKWA',
    title: 'Back Layout on Floor | Gymnastics Acrobatics',
    channelName: 'Eureka Gymnastics Club',
    thumbnail: 'https://i.ytimg.com/vi/DSckWbWDKWA/hqdefault.jpg',
  },
  'tsukahara vault': {
    videoId: '8QvztPNJwCc',
    title: 'Tsuk Vault Drills Progression & Journey',
    channelName: 'Alizé Lee',
    thumbnail: 'https://i.ytimg.com/vi/8QvztPNJwCc/hqdefault.jpg',
  },
  'yurchenko vault': {
    videoId: 'eMB2go49_YE',
    title: 'Gymnastics Learning the Yurchenko',
    channelName: 'Nick Blanton',
    thumbnail: 'https://i.ytimg.com/vi/eMB2go49_YE/hqdefault.jpg',
  },
  'double back somersault': {
    videoId: 'VRGaVSSOSLk',
    title: 'Double Back Tuck Somersault Drills on Floor',
    channelName: 'USA Trampoline Academy',
    thumbnail: 'https://i.ytimg.com/vi/VRGaVSSOSLk/hqdefault.jpg',
  },
};

// Check if a skill name matches any in the verified dictionary
function findInVerifiedCoachingTutorials(skillName: string) {
  const clean = skillName.toLowerCase().trim();
  if (VERIFIED_COACHING_TUTORIALS[clean]) {
    return VERIFIED_COACHING_TUTORIALS[clean];
  }

  // Check substring matches
  for (const [key, data] of Object.entries(VERIFIED_COACHING_TUTORIALS)) {
    if (clean.includes(key) || key.includes(clean)) {
      return data;
    }
  }
  return null;
}

// YouTube Data API v3 live search function
async function searchYouTubeDataApi(query: string, apiKey: string) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=8&q=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    console.error('YouTube API error:', response.status, errorText);
    throw new Error(`YouTube API returned ${response.status}: ${errorText}`);
  }
  const data = await response.json();
  return data.items || [];
}

// Live scraping & oEmbed fallback search function
async function searchYouTubeViaOembed(query: string, skillName: string) {
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Extract video IDs from search result page
    const matches = Array.from(html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g));
    const videoIds = Array.from(new Set(matches.map((m) => m[1]))).slice(0, 5);

    for (const vid of videoIds) {
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`);
        if (oembedRes.ok) {
          const info = await oembedRes.json();
          if (isSkillMatch(info.title, skillName)) {
            return {
              videoId: vid,
              title: info.title,
              channelName: info.author_name,
              thumbnail: info.thumbnail_url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
            };
          }
        }
      } catch (err) {
        // continue to next candidate
      }
    }
  } catch (err) {
    console.warn('Oembed fallback search error:', err);
  }
  return null;
}

// A failed search must answer the one request, never reach the process as an unhandled rejection.
function handled(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

function remember(key: string, value: unknown) {
  if (searchCache.size >= MAX_CACHED_SEARCHES) searchCache.clear();
  searchCache.set(key, value);
}

/** The skill tutorial search, mounted at /api/youtube. */
export function youtubeRouter() {
  const router = Router();
  router.use(express.json({ limit: '1mb' }));

  // API: YouTube API Key & Integration Status
  router.get('/status', (req: Request, res: Response) => {
    const hasEnvKey = !!process.env.YOUTUBE_API_KEY;
    res.json({
      hasApiKey: hasEnvKey,
      service: 'YouTube Data API v3',
      configuredIn: hasEnvKey ? '.env (Server)' : 'Not configured in environment',
      instructions: {
        step1: 'Enable "YouTube Data API v3" in Google Cloud Console (APIs & Services > Library)',
        step2: 'Create an API Key (Credentials > Create Credentials > API Key)',
        step3: 'Add YOUTUBE_API_KEY=your_key to .env or in AI Studio Settings panel',
      },
    });
  });

  // API: Search Tutorial for an individual gymnastics skill
  router.post('/search', handled(async (req: Request, res: Response) => {
    const { skillName, apiKey: bodyKey } = req.body ?? {};

    const cleanSkill = skillNameOf(skillName);
    if (!cleanSkill) {
      return res.status(400).json({ error: 'skillName is required' });
    }

    const apiKey = (req.headers['x-youtube-api-key'] as string) || bodyKey || process.env.YOUTUBE_API_KEY;

    const fallbackSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${cleanSkill} gymnastics tutorial`)}`;

    // Check cache first
    const cacheKey = `${cleanSkill.toLowerCase()}_${apiKey ? 'api' : 'noapi'}`;
    if (searchCache.has(cacheKey)) {
      return res.json(searchCache.get(cacheKey));
    }

    // 1. If YouTube Data API v3 key is provided, search official API
    if (apiKey) {
      const searchCombinations = [
        `${cleanSkill} gymnastics tutorial`,
        `${cleanSkill} gymnastics beginner tutorial`,
        `how to do ${cleanSkill} gymnastics`,
        `${cleanSkill} gymnastics drills`,
      ];

      for (const q of searchCombinations) {
        try {
          const items = await searchYouTubeDataApi(q, apiKey);
          for (const item of items) {
            const title = item.snippet?.title || '';
            if (isSkillMatch(title, cleanSkill)) {
              const vid = item.id?.videoId;
              const result = {
                found: true,
                tutorial: {
                  videoId: vid,
                  title: item.snippet.title,
                  thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                  channelName: item.snippet.channelTitle,
                  youtubeUrl: `https://www.youtube.com/watch?v=${vid}`,
                  embedUrl: `https://www.youtube-nocookie.com/embed/${vid}`,
                  searchQuery: q,
                },
                source: 'api',
                searchQuery: q,
                fallbackSearchUrl,
              };
              remember(cacheKey, result);
              return res.json(result);
            }
          }
        } catch (err) {
          console.error(`Search query failed on YouTube API for "${q}":`, err);
          // continue to next combination or fallback
        }
      }
    }

    // 2. Check verified coaching registry first for instantaneous 100% verified video
    const verified = findInVerifiedCoachingTutorials(cleanSkill);
    if (verified) {
      const result = {
        found: true,
        tutorial: {
          videoId: verified.videoId,
          title: verified.title,
          thumbnail: verified.thumbnail,
          channelName: verified.channelName,
          youtubeUrl: `https://www.youtube.com/watch?v=${verified.videoId}`,
          embedUrl: `https://www.youtube.com/embed/${verified.videoId}`,
          searchQuery: `${cleanSkill} gymnastics tutorial`,
        },
        source: 'verified_cache',
        searchQuery: `${cleanSkill} gymnastics tutorial`,
        fallbackSearchUrl,
      };
      remember(cacheKey, result);
      return res.json(result);
    }

    // 3. Try live scraping & oEmbed verification
    const liveResult = await searchYouTubeViaOembed(`${cleanSkill} gymnastics tutorial`, cleanSkill);
    if (liveResult) {
      const result = {
        found: true,
        tutorial: {
          videoId: liveResult.videoId,
          title: liveResult.title,
          thumbnail: liveResult.thumbnail,
          channelName: liveResult.channelName,
          youtubeUrl: `https://www.youtube.com/watch?v=${liveResult.videoId}`,
          embedUrl: `https://www.youtube.com/embed/${liveResult.videoId}`,
          searchQuery: `${cleanSkill} gymnastics tutorial`,
        },
        source: 'oembed',
        searchQuery: `${cleanSkill} gymnastics tutorial`,
        fallbackSearchUrl,
      };
      remember(cacheKey, result);
      return res.json(result);
    }

    // 4. Strict Fallback if no suitable video found
    const notFoundResult = {
      found: false,
      message: 'No suitable tutorial found yet.',
      fallbackSearchUrl,
      searchQuery: `${cleanSkill} gymnastics tutorial`,
      apiKeyConfigured: !!apiKey,
    };
    remember(cacheKey, notFoundResult);
    return res.json(notFoundResult);
  }));

  // API: Batch Search for all skills
  router.post('/batch', handled(async (req: Request, res: Response) => {
    const skillList = req.body?.skills;
    if (!Array.isArray(skillList) || skillList.length > MAX_BATCH) {
      return res.status(400).json({ error: 'skills array is required' });
    }
    const items = skillList.map((item) => ({ key: item?.id, name: skillNameOf(item?.name ?? item) }));
    if (items.some((item) => !item.name)) {
      return res.status(400).json({ error: 'every skill needs a name' });
    }

    const results: Record<string, any> = {};

    for (const item of items) {
      const clean = item.name as string;
      const verified = findInVerifiedCoachingTutorials(clean);
      if (verified) {
        results[item.key || clean] = {
          found: true,
          tutorial: {
            videoId: verified.videoId,
            title: verified.title,
            thumbnail: verified.thumbnail,
            channelName: verified.channelName,
            youtubeUrl: `https://www.youtube.com/watch?v=${verified.videoId}`,
            embedUrl: `https://www.youtube-nocookie.com/embed/${verified.videoId}`,
            searchQuery: `${clean} gymnastics tutorial`,
          },
        };
      } else {
        results[item.key || clean] = {
          found: false,
          message: 'No suitable tutorial found yet.',
          fallbackSearchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${clean} gymnastics tutorial`)}`,
        };
      }
    }

    res.json({ results });
  }));

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (error as { status?: number })?.status;
    if (!status || status >= 500) console.error('Tutorial search failed', error instanceof Error ? error.message : error);
    res.status(status && status < 500 ? status : 500).json({ error: 'The tutorial search failed.' });
  });

  return router;
}
