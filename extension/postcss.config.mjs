// WXT FAQ fix for the floating UI: rem units are relative to the host page's
// <html> font-size, which lives outside the Shadow DOM. Convert rem -> px at
// build time (rootValue 16) so the UI keeps its intended size on any website.
import remToPx from 'postcss-rem-to-responsive-pixel'

export default {
  plugins: [
    remToPx({
      rootValue: 16,
      propList: ['*'],
      transformUnit: 'px',
    }),
  ],
}
