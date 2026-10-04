// One shared SVG asset for every instance: no duplicate gradient IDs in the DOM.
// The default is decorative because the surrounding UI already names the brand.
const variants = {
  dark: 'arthaai-mark.svg',
  light: 'arthaai-mark-light.svg',
  mono: 'arthaai-mark-mono.svg',
  white: 'arthaai-mark-white.svg',
}

export default function Logo({ size = 26, className = '', variant = 'dark', label = '' }) {
  return (
    <img
      src={`/brand/${variants[variant] || variants.dark}`}
      width={size}
      height={size}
      alt={label}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={`shrink-0 ${className}`}
    />
  )
}
