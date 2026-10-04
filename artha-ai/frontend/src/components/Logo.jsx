// One shared SVG asset for every instance: no duplicate gradient IDs in the DOM.
// The default is decorative because the surrounding UI already names the brand.
export default function Logo({ size = 26, className = '', variant = 'dark', label = '', full = false }) {
  return (
    <img
      src={`/brand/${full ? (variant === 'light' ? 'logo-light.svg' : 'logo-dark.svg') : 'logo-mark.svg'}`}
      width={full ? size * 460 / 128 : size}
      height={size}
      alt={label}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={`shrink-0 ${className}`}
    />
  )
}
