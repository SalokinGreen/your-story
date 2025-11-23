# UI Art Direction Guide

## Design Philosophy

Your Story's interface embraces a modern, vibrant aesthetic that balances playfulness with professionalism. The design should feel approachable and exciting while maintaining clarity and usability.

## Color Palette

### Primary Colors

- **Blue**: `blue-50` to `blue-900` - Trust, stability, primary actions
- **Purple**: `purple-50` to `purple-900` - Creativity, AI/magic elements
- **Pink**: `pink-50` to `pink-900` - Energy, engagement, accents

### Semantic Colors

- **Green**: Success states, savings indicators, bonuses (`green-100`, `green-600`, `green-800`)
- **Gray**: Neutral backgrounds, text hierarchy (`gray-50` to `gray-900`, `zinc-50` to `zinc-600`)
- **Red/Orange**: Warnings, errors (use sparingly)

### Gradient Usage

Gradients are a signature element of the brand:

- **Background gradients**: `bg-linear-to-br from-blue-50 via-purple-50 to-pink-50` (light mode)
- **Hero text gradients**: `bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent`
- **Header gradients**: `bg-linear-to-r from-blue-600 to-purple-600`
- Use 2-3 color stops for smooth transitions

## Typography

### Hierarchy

- **Hero headings**: `text-4xl sm:text-5xl lg:text-6xl font-bold`
- **Section headings**: `text-3xl sm:text-4xl font-bold`
- **Card titles**: `text-xl sm:text-2xl font-bold`
- **Body text**: `text-base sm:text-lg`
- **Small text**: `text-sm`
- **Labels**: `text-xs font-semibold uppercase tracking-wide`

### Font Weight

- Headings: `font-bold` or `font-semibold`
- Body: Default weight
- Emphasis: `font-semibold`

## Layout & Spacing

### Container Widths

- **Landing page**: `max-w-6xl` for full-width content sections
- **Forms/Auth**: `max-w-md` for focused interactions
- **Content pages**: `max-w-4xl` for reading/story content
- **Tables**: `max-w-5xl` for data display

### Padding & Margins

- **Section spacing**: `mb-8 sm:mb-12` between major sections
- **Card padding**: `p-6 sm:p-8` for important containers
- **Compact cards**: `p-4` for smaller elements
- **Component gaps**: `gap-4` standard, `gap-6` for breathing room

### Responsive Breakpoints

Always provide mobile-first design with responsive utilities:

- Base: Mobile-first (no prefix)
- `sm:` Tablet and up (640px+)
- `md:` Desktop (768px+)
- `lg:` Large desktop (1024px+)

## Component Styling

### Cards

```
bg-white dark:bg-blue-950
rounded-xl sm:rounded-2xl
shadow-lg
border border-gray-200 dark:border-gray-700
p-6 sm:p-8
```

### Buttons (Primary)

```
px-6 py-3
bg-blue-600 hover:bg-blue-700
dark:bg-blue-500 dark:hover:bg-blue-600
text-white font-semibold
rounded-lg
transition-colors
shadow-md hover:shadow-lg
```

### Buttons (Secondary)

```
px-6 py-3
border-2 border-black dark:border-white
hover:bg-black hover:text-white
dark:hover:bg-white dark:hover:text-black
font-semibold
transition-colors
```

### Input Fields

```
w-full px-4 py-3
border-2 border-gray-300 dark:border-gray-600
focus:border-blue-500 focus:ring-2 focus:ring-blue-200
dark:focus:border-blue-400 dark:focus:ring-blue-800
rounded-lg
bg-white dark:bg-blue-950
transition-colors
```

### Badges & Tags

```
px-3 py-1
bg-purple-600 text-white (or semantic color)
rounded-full
text-xs sm:text-sm
font-semibold
```

### Tables (Desktop)

- Headers: Gradient background `bg-linear-to-r from-blue-600 to-purple-600 text-white`
- Rows: `hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`
- Borders: `divide-y divide-gray-200 dark:divide-gray-700`
- Highlighted rows: `ring-2 ring-purple-500` with light background tint

### Mobile Alternatives

Replace tables with card grids on mobile:

- `grid gap-4` for card layout
- Each row becomes a standalone card with vertical layout
- Key-value pairs displayed with `flex justify-between`

## Dark Mode

### Strategy

Always provide dark mode alternatives using the `dark:` prefix:

- Backgrounds: `bg-white dark:bg-blue-950` or `bg-zinc-50 dark:bg-black`
- Text: `text-gray-900 dark:text-white` for headings, `text-gray-600 dark:text-gray-400` for body
- Borders: `border-gray-200 dark:border-gray-700`
- Gradients work in both modes but may need darker variants for dark mode

### Contrast

Ensure sufficient contrast in both modes:

- Light mode: Darker text on lighter backgrounds
- Dark mode: Lighter text on darker backgrounds
- Interactive elements should have clear hover/focus states in both modes

## Visual Effects

### Shadows

- Cards: `shadow-lg` or `shadow-xl`
- Buttons: `shadow-md` default, `hover:shadow-lg`
- Subtle depth: `shadow-sm`

### Borders

- Prominent borders: `border-2` with theme colors
- Subtle dividers: `border` with gray tones
- Emphasis borders: `ring-2` for highlights

### Transitions

Always animate interactive elements:

```
transition-colors
transition-all
hover:scale-105 (for cards/buttons that should "lift")
```

### Rounded Corners

- Cards: `rounded-xl` or `rounded-2xl`
- Buttons: `rounded-lg`
- Badges: `rounded-full`
- Images: `rounded-full` for avatars, `rounded-lg` for content

## Icons & Imagery

### Icons

Use emoji for quick visual communication:

- Features: ⚡ (AI), 🎮 (Choices), ∞ (Infinite)
- Actions: 🔄 (Refresh), 💡 (Tips), 🔗 (Links), 📍 (Location)
- Fallback to text when appropriate

### Avatar Images

```
w-20 h-20 sm:w-24 sm:h-24
rounded-full
object-cover
border-2 border-black dark:border-white
```

### Fallback Avatars

```
bg-gray-300 dark:bg-gray-900
flex items-center justify-center
text-2xl sm:text-3xl font-bold
text-gray-600 dark:text-gray-400
```

## Highlighted Elements

### "Popular" or Featured Items

- Background tint: `bg-purple-50 dark:bg-purple-900/20`
- Border emphasis: `ring-2 ring-purple-500`
- Badge: `bg-purple-600 text-white rounded-full text-xs`

### Success/Savings Indicators

- Background: `bg-green-100 dark:bg-green-900`
- Text: `text-green-800 dark:text-green-200`
- Font: `font-semibold`

### Info Boxes

```
p-4
bg-blue-50 dark:bg-blue-900/20
border border-blue-200 dark:border-blue-800
rounded-lg
text-blue-900 dark:text-blue-200
```

## Animation Guidelines

### Loading States

```
animate-spin
rounded-full h-12 w-12
border-b-2 border-blue-600 dark:border-blue-400
```

### Hover Effects

- Scale slightly: `hover:scale-105`
- Background change: `hover:bg-gray-50 dark:hover:bg-gray-700`
- Shadow increase: `hover:shadow-lg`
- Always use `transition-all` or `transition-colors`

## Accessibility

### Focus States

Always provide visible focus indicators:

```
focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800
focus:border-blue-500 dark:focus:border-blue-400
focus:outline-none
```

### Color Independence

- Don't rely solely on color to convey information
- Use icons, text labels, or patterns alongside color
- Ensure text has sufficient contrast (WCAG AA minimum)

## Best Practices

1. **Mobile-first**: Design for mobile, enhance for desktop
2. **Consistency**: Reuse component patterns across the app
3. **Hierarchy**: Use size, weight, and color to guide attention
4. **Whitespace**: Don't be afraid of generous spacing
5. **Performance**: Use Tailwind utilities to keep bundle size small
6. **Dark mode**: Always test both color schemes
7. **Responsive**: Test at multiple breakpoints (mobile, tablet, desktop)

## Example Component Patterns

### Landing Hero

```tsx
<div className="text-center mb-8 sm:mb-12">
  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
    Hero Title
  </h1>
  <p className="max-w-2xl mx-auto text-lg sm:text-xl text-gray-700 dark:text-gray-300">
    Supporting description
  </p>
</div>
```

### Feature Card

```tsx
<div className="px-6 py-3 bg-white dark:bg-blue-950 rounded-lg shadow-md">
  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
    Icon
  </div>
  <div className="text-sm text-gray-600 dark:text-gray-400">Label</div>
</div>
```

### Data Table (Desktop) to Card Grid (Mobile)

```tsx
{
  /* Desktop Table */
}
<div className="hidden md:block overflow-x-auto bg-white dark:bg-blue-950 rounded-2xl shadow-xl">
  <table className="w-full">
    <thead className="bg-linear-to-r from-blue-600 to-purple-600 text-white">
      {/* headers */}
    </thead>
    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
      {/* rows with hover:bg-gray-50 dark:hover:bg-gray-700 */}
    </tbody>
  </table>
</div>;

{
  /* Mobile Cards */
}
<div className="md:hidden grid gap-4">
  {items.map((item) => (
    <div className="bg-white dark:bg-blue-950 rounded-xl shadow-lg p-6">
      {/* key-value pairs with flex justify-between */}
    </div>
  ))}
</div>;
```

## Future Considerations

- Consider adding subtle animations (fade-in, slide-up) for page transitions
- Custom illustrations could enhance the storytelling theme
- Maintain the vibrant, gradient-heavy aesthetic as a brand signature
- Keep the design scalable for additional features (inventory, achievements, etc.)
