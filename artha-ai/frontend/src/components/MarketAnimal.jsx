// Identical original vector masters in the intro, landing and research results.
export default function MarketAnimal({ side = 'bull', className = '', label = '', lazy = true }) {
  return <img className={`market-animal market-animal-${side} ${className}`}
    src={`/brand/${side === 'bear' ? 'bear' : 'bull'}.svg`} width="240" height="180"
    alt={label} aria-hidden={label ? undefined : true} draggable={false}
    loading={lazy ? 'lazy' : 'eager'} decoding="async" />
}
