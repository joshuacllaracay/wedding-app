// Replace these placeholders before sharing the invitation.
export const wedding = {
  // Public guest-facing domain. Never use an admin/preview deployment URL for sharing.
  invitationSiteUrl: 'https://www.chykaandemmanuel.com',
  bride: 'Chyka',
  groom: 'Emmanuel',
  brideFullName: 'Chyka Claracay',
  groomFullName: 'Emmanuel Ladera',
  sampleDetails: false,
  date: '6 February 2027',
  time: 'Ceremony at 3:30 in the afternoon',
  // Used by the countdown. Include the timezone (Singapore / Philippines = +08:00).
  ceremonyStartsAt: '2027-02-06T15:30:00+08:00',
  // Background video of the opening section (in /public). Set to '' to show a plain dark background.
  teaserVideoUrl: '/video/teaser.mp4',
  // Only this part of the video loops behind the names (skips the film's own title and end cards).
  heroVideoLoop: { start: 10, end: 33 },
  // Names on the opening video, e.g. "Emman & Chyka are getting married".
  heroNames: ['Emman', 'Chyka'],
  // Photos that slide through the two circles in the RSVP section (in /public).
  couplePhotos: ['/couple/photo-1.webp', '/couple/photo-2.webp', '/couple/photo-3.webp', '/couple/photo-4.webp'],
  // Order of the day, shown in "The Program" section. icon: assemble | ceremony | cocktail | reception
  program: [
    { time: '3:00', period: 'PM', title: 'Assemble', icon: 'assemble' },
    { time: '3:30', period: 'PM', title: 'Ceremony', icon: 'ceremony' },
    { time: '5:00', period: 'PM', title: 'Cocktail Hour', icon: 'cocktail' },
    { time: '6:00', period: 'PM', title: 'Reception', icon: 'reception' },
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
  // Dress code section. Edit the wording freely.
  dressCodeIntro: 'We kindly invite our guests to dress in formal attire and adhere to the colors as we celebrate this special occasion.',
  dressGentlemen: 'Long-sleeved barong in light brown, caramel or sand beige, paired with dark brown slacks and dress shoes.',
  dressLadies: 'Long gowns in elegant silhouettes and soft, warm tones. Fabrics like chiffon, satin, tulle or crepe are highly encouraged. Kindly leave white and ivory for the bride.',
  // Colours sampled from the attire guides.
  guestPalette: [
    { name: 'Soft Taupe', hex: '#ccb1a1' }, { name: 'Taupe', hex: '#be9678' }, { name: 'Sand Beige', hex: '#efceaa' },
    { name: 'Camel', hex: '#e7b588' }, { name: 'Apricot', hex: '#f7ae84' }, { name: 'Caramel', hex: '#dc9f6f' },
    { name: 'Light Brown', hex: '#c68351' }, { name: 'Cappuccino', hex: '#b77855' }, { name: 'Biscoff', hex: '#b9662c' },
    { name: 'Toffee', hex: '#945120' },
  ],
  guestAttire: [
    { label: 'For ladies', image: '/attire/guests-women.webp', width: 528, height: 394, alt: 'Attire for lady guests: long gowns in soft taupe, taupe, camel, caramel, apricot, cappuccino, light brown, biscoff and toffee.' },
    { label: 'For gentlemen', image: '/attire/guests-men.webp', width: 516, height: 412, alt: 'Attire for gentlemen guests: long-sleeved barong in light brown, caramel or sand beige with dark brown trousers.' },
  ],
  dressNote: 'We would love to see you in warm neutrals, champagne, taupe, and soft brown. Please leave white and ivory for the bride.',
  // Original synthesized placeholder. Replace with your chosen licensed track.
  musicUrl: '/music/golden-hour-violin.mp3',
};
