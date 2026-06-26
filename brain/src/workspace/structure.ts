import { BLOCK_TYPES, type BlockType } from '@/blocks'

import { normalizeLayout } from './layout'

/** Starter content for a freshly-added section (so it's never blank). */
const DEFAULTS: Record<BlockType, () => any> = {
  hero: () => ({ blockType: 'hero', heading: 'Your headline', subheading: 'A short supporting line' }),
  features: () => ({
    blockType: 'features',
    heading: 'What we offer',
    items: [
      { title: 'Feature one', text: 'Describe it.' },
      { title: 'Feature two', text: 'Describe it.' },
      { title: 'Feature three', text: 'Describe it.' },
    ],
  }),
  products: () => ({
    blockType: 'products',
    heading: 'Our products',
    items: [
      { name: 'Product one', description: 'A short description of this product.' },
      { name: 'Product two', description: 'A short description of this product.' },
      { name: 'Product three', description: 'A short description of this product.' },
    ],
  }),
  testimonials: () => ({ blockType: 'testimonials', heading: 'What customers say', items: [{ quote: 'A great quote about you.', author: 'A happy customer' }] }),
  gallery: () => ({ blockType: 'gallery', heading: 'Gallery', items: [{ caption: 'Photo one' }, { caption: 'Photo two' }, { caption: 'Photo three' }] }),
  faq: () => ({
    blockType: 'faq',
    heading: 'Frequently asked questions',
    items: [
      { question: 'What do you offer?', answer: 'Describe it here.' },
      { question: 'How does it work?', answer: 'Explain it here.' },
    ],
  }),
  pricing: () => ({
    blockType: 'pricing',
    heading: 'Pricing',
    items: [
      { name: 'Basic', price: '$9', period: '/mo', features: 'Feature one\nFeature two', buttonLabel: 'Choose Basic' },
      { name: 'Pro', price: '$29', period: '/mo', features: 'Everything in Basic\nMore features', buttonLabel: 'Choose Pro', highlighted: 'true' },
    ],
  }),
  logos: () => ({ blockType: 'logos', heading: 'Trusted by', items: [{ alt: 'Logo one' }, { alt: 'Logo two' }, { alt: 'Logo three' }, { alt: 'Logo four' }] }),
  cta: () => ({ blockType: 'cta', heading: 'Ready to get started?', buttonLabel: 'Get in touch' }),
  contact: () => ({ blockType: 'contact', heading: 'Contact us', text: 'Get in touch with us today.', buttonLabel: 'Email us' }),
  richText: () => ({ blockType: 'richText', heading: 'About', body: 'Tell your story here.' }),
}

const newItem = (blockType: string) => {
  if (blockType === 'testimonials') return { quote: 'A great quote.', author: 'A customer' }
  if (blockType === 'products') return { name: 'New product', description: 'A short description.' }
  if (blockType === 'gallery') return { caption: 'New photo' }
  if (blockType === 'faq') return { question: 'A new question?', answer: 'The answer.' }
  if (blockType === 'pricing') return { name: 'New plan', price: '$0', period: '/mo', features: 'Feature one\nFeature two', buttonLabel: 'Choose' }
  if (blockType === 'logos') return { alt: 'New logo' }
  return { title: 'New item', text: 'Describe it.' }
}

/**
 * Apply a structural operation to a page's layout and return the new layout
 * (writable form, images preserved), or null if the op/params are invalid.
 * Ops: add-section, delete-section, move-section (up/down), add-item, delete-item.
 */
export function applyStructureOp(page: any, body: any): any[] | null {
  const layout = normalizeLayout(page)
  const index = Number(body?.index)
  const inRange = Number.isInteger(index) && index >= 0 && index < layout.length

  switch (body?.op) {
    case 'add-section': {
      const type = body?.type
      if (!(BLOCK_TYPES as readonly string[]).includes(type)) return null
      const at = Number.isInteger(index) && index >= 0 && index <= layout.length ? index : layout.length
      layout.splice(at, 0, DEFAULTS[type as BlockType]())
      return layout
    }
    case 'delete-section':
      if (!inRange) return null
      layout.splice(index, 1)
      return layout
    case 'move-section': {
      if (!inRange) return null
      const j = index + (body?.dir === 'up' ? -1 : 1)
      if (j < 0 || j >= layout.length) return layout // edge: no-op
      ;[layout[index], layout[j]] = [layout[j], layout[index]]
      return layout
    }
    case 'add-item': {
      if (!inRange) return null
      const b = layout[index]
      const ITEM_BLOCKS = ['features', 'testimonials', 'products', 'gallery', 'faq', 'pricing', 'logos']
      if (!ITEM_BLOCKS.includes(b.blockType)) return null
      if (!Array.isArray(b.items)) b.items = []
      b.items.push(newItem(b.blockType))
      return layout
    }
    case 'delete-item': {
      if (!inRange) return null
      const b = layout[index]
      const ii = Number(body?.itemIndex)
      if (!Array.isArray(b.items) || !Number.isInteger(ii) || ii < 0 || ii >= b.items.length) return null
      b.items.splice(ii, 1)
      return layout
    }
    default:
      return null
  }
}
