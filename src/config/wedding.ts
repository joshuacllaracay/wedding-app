// Replace these placeholders before sharing the invitation.
export const wedding = {
  // Public guest-facing domain. Never use an admin/preview deployment URL for sharing.
  invitationSiteUrl: 'https://wedding-app-ochre-six.vercel.app',
  bride: 'Chyka',
  groom: 'Emmanuel',
  brideFullName: 'Chyka Claracay',
  groomFullName: 'Emmanuel Ladera',
  sampleDetails: false,
  date: '6 February 2027',
  time: 'Ceremony at 3:30 in the afternoon',
  // Used by the countdown. Include the timezone (Singapore / Philippines = +08:00).
  ceremonyStartsAt: '2027-02-06T15:30:00+08:00',
  // Teaser video in /public. Set to '' to hide the section.
  teaserVideoUrl: '/video/teaser.mp4',
  // Order of the day, shown in "The Program" section.
  program: [
    { time: '3:00', period: 'PM', title: 'Assemble' },
    { time: '3:30', period: 'PM', title: 'Ceremony' },
    { time: '5:00', period: 'PM', title: 'Cocktail Hour' },
    { time: '6:00', period: 'PM', title: 'Reception' },
  ],
  venue: 'Montebello Hotel, Cebu',
  address: 'Montebello Drive, Brgy. Apas, Gov. M. Cuenco Ave, Cebu City',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Montebello+Hotel+Cebu+City',
  // Shown at the bottom of the venue section.
  venueUrl: 'https://www.montebello.ph',
  rsvpDeadline: '6 January 2027',
  // Optional ISO instant, including timezone, e.g. 2027-01-06T23:59:59+08:00.
  rsvpClosesAt: '',
  dressCode: 'Formal attire',
  // Attire guide carousel (images in /public/attire). The title shows above each image.
  attireGuides: [
    { title: 'Guests', image: '/attire/guests.webp', width: 1666, height: 752, alt: 'Attire guide for guests: long gowns in soft taupe, cognac and apricot; barong or a beige suit with black trousers. Colour palette: soft taupe, sand beige, camel, caramel, apricot, cappuccino, cognac and soft terracotta.' },
    { title: 'Principal Sponsors', image: '/attire/principal-sponsors.webp', width: 1730, height: 706, alt: 'Attire guide for principal sponsors: women in shades of champagne gold to light gold; men in a beige barong with black trousers.' },
    { title: 'Secondary Sponsors', image: '/attire/secondary-sponsors.webp', width: 1658, height: 674, alt: 'Attire guide for secondary sponsors: women and men in light chocolate and light mocha.' },
  ],
  dressNote: 'We would love to see you in warm neutrals, champagne, taupe, and soft brown. Please leave white and ivory for the bride.',
  // Original synthesized placeholder. Replace with your chosen licensed track.
  musicUrl: '/music/demo.wav',
};
