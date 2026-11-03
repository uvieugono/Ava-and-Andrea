export interface VerifiedClub {
  id: string;
  name: string;
  city: 'Lagos';
  logo: string | null;
  address: string | null;
  /** Areas the club trains in, when it has more than one site. */
  areas?: string | null;
  /** Picture kept in public/clubs, without the extension. */
  image?: string | null;
  phone: string | null;
  coach: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  youtube: string | null;
}

// Only details that could be checked against a public page or news caption.
// A blank field is left out of the page. Still wanted for Tee Tumblers: logo, TikTok, YouTube, and
// street addresses for the Lekki and Meadow Hall sites. For Kofunjo: logo, street addresses, Facebook,
// TikTok, YouTube.
export const VERIFIED_CLUBS: VerifiedClub[] = [
  {
    id: 'tee-tumblers-surulere',
    name: 'Tee Tumblers Gymnastics Club',
    city: 'Lagos',
    logo: null,
    image: '/clubs/teetumblers-gymnastics',
    areas: 'Lekki / Surulere',
    address: 'Pampers School, 99 Owukori Crescent, Alaka Estate, Surulere, Lagos',
    phone: '0809 093 2463, 0813 002 7220',
    coach: 'Patrick Umoh',
    instagram: 'https://www.instagram.com/teetumblersgymnastics/',
    facebook: 'https://www.facebook.com/Teetumblersgymnastics/',
    tiktok: null,
    youtube: null,
  },
  {
    id: 'kofunjo-gymnastics-club',
    name: 'Kofunjo Gymnastics Club',
    city: 'Lagos',
    logo: null,
    image: '/clubs/kofunjo-gymnastics-club',
    areas: 'Ajah / Lekki, Gbagada / Maryland, Mowe',
    address: null,
    phone: '0703 966 3526',
    coach: 'Korede Nejo',
    instagram: 'https://www.instagram.com/kofunjo_club/',
    facebook: null,
    tiktok: null,
    youtube: null,
  },
];
