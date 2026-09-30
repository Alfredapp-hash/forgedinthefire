export const PODCAST = {
  title: 'Forged in the Fire',
  author: 'Tracy / Forged in the Fire',
  email: 'tracys@forgedinthefireohio.org',
  site: 'https://forgedinthefireohio.org',
  page: 'https://forgedinthefireohio.org/podcast',
  feed: 'https://forgedinthefireohio.org/podcast/rss.xml',
  category: 'Society & Culture',
  description:
    'A survivor-centered conversation about healing, housing, and hope from Forged in the Fire in Lorain County, Ohio. Dignity first. No spectacle.',
  /** 3000×3000 RGB JPEG — Apple / Spotify minimum is 1400×1400 square. */
  image: 'https://forgedinthefireohio.org/podcast/cover-3000.jpg',
  /** Podcasting 2.0 <podcast:funding> target. */
  funding: 'https://forgedinthefireohio.org/donate',
  fundingLabel: 'Support survivors through Forged in the Fire',
} as const

/** The original seed pointed at a 1024px JPEG with a .png name — Apple rejects it. */
export const LEGACY_COVER_URLS = [
  'https://forgedinthefireohio.org/brand/fitf-lockup.png',
  '/brand/fitf-lockup.png',
]

/** Podcasting 2.0 namespace UUID for <podcast:guid> (UUIDv5 of the feed URL). */
export const PODCAST_GUID_NAMESPACE = 'ead4c236-bf58-58c6-a2c6-a6b28d128cb6'

/** Apple Podcasts category taxonomy (top level → subcategories). */
export const APPLE_CATEGORIES: Record<string, string[]> = {
  Arts: ['Books', 'Design', 'Fashion & Beauty', 'Food', 'Performing Arts', 'Visual Arts'],
  Business: ['Careers', 'Entrepreneurship', 'Investing', 'Management', 'Marketing', 'Non-Profit'],
  Comedy: ['Comedy Interviews', 'Improv', 'Stand-Up'],
  Education: ['Courses', 'How To', 'Language Learning', 'Self-Improvement'],
  Fiction: ['Comedy Fiction', 'Drama', 'Science Fiction'],
  Government: [],
  History: [],
  'Health & Fitness': ['Alternative Health', 'Fitness', 'Medicine', 'Mental Health', 'Nutrition', 'Sexuality'],
  'Kids & Family': ['Education for Kids', 'Parenting', 'Pets & Animals', 'Stories for Kids'],
  Leisure: ['Animation & Manga', 'Automotive', 'Aviation', 'Crafts', 'Games', 'Hobbies', 'Home & Garden', 'Video Games'],
  Music: ['Music Commentary', 'Music History', 'Music Interviews'],
  News: ['Business News', 'Daily News', 'Entertainment News', 'News Commentary', 'Politics', 'Sports News', 'Tech News'],
  'Religion & Spirituality': ['Buddhism', 'Christianity', 'Hinduism', 'Islam', 'Judaism', 'Religion', 'Spirituality'],
  Science: ['Astronomy', 'Chemistry', 'Earth Sciences', 'Life Sciences', 'Mathematics', 'Natural Sciences', 'Nature', 'Physics', 'Social Sciences'],
  'Society & Culture': ['Documentary', 'Personal Journals', 'Philosophy', 'Places & Travel', 'Relationships'],
  Sports: ['Baseball', 'Basketball', 'Cricket', 'Fantasy Sports', 'Football', 'Golf', 'Hockey', 'Rugby', 'Running', 'Soccer', 'Swimming', 'Tennis', 'Volleyball', 'Wilderness', 'Wrestling'],
  Technology: [],
  'True Crime': [],
  'TV & Film': ['After Shows', 'Film History', 'Film Interviews', 'Film Reviews', 'TV Reviews'],
}
