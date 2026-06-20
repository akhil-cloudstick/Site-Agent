import type { Block } from 'payload'

/**
 * Section "primitives" — the dynamic building blocks a page is composed from.
 * A page's `layout` is an ordered list of these; the customer (and the AI) can
 * add any number, in any order, with any number of items. This is the core
 * "compose anything" model (a pragmatic version of AgentPlan.md Module 7).
 */

export const heroBlock: Block = {
  slug: 'hero',
  interfaceName: 'HeroBlock',
  fields: [
    { name: 'heading', type: 'text' },
    { name: 'subheading', type: 'text' },
    { name: 'image', type: 'upload', relationTo: 'media' },
  ],
}

export const featuresBlock: Block = {
  slug: 'features',
  interfaceName: 'FeaturesBlock',
  fields: [
    { name: 'heading', type: 'text' },
    // Optional section background image.
    { name: 'image', type: 'upload', relationTo: 'media' },
    {
      name: 'items',
      type: 'array',
      // Each item can carry its own image (e.g. a product photo).
      fields: [{ name: 'title', type: 'text' }, { name: 'text', type: 'textarea' }, { name: 'image', type: 'upload', relationTo: 'media' }],
    },
  ],
}

export const productsBlock: Block = {
  slug: 'products',
  interfaceName: 'ProductsBlock',
  fields: [
    { name: 'heading', type: 'text' },
    { name: 'image', type: 'upload', relationTo: 'media' },
    {
      name: 'items',
      type: 'array',
      // Only `name` is meaningful on its own; everything else is optional so the
      // same card can be a plain image+name+description card OR a full shop card.
      fields: [
        { name: 'name', type: 'text' },
        { name: 'description', type: 'textarea' },
        { name: 'price', type: 'text' },
        { name: 'oldPrice', type: 'text' }, // shown struck-through
        { name: 'badge', type: 'text' }, // e.g. "-30%"
        { name: 'buttonLabel', type: 'text' },
        { name: 'image', type: 'upload', relationTo: 'media' },
      ],
    },
  ],
}

export const testimonialsBlock: Block = {
  slug: 'testimonials',
  interfaceName: 'TestimonialsBlock',
  fields: [
    { name: 'heading', type: 'text' },
    { name: 'image', type: 'upload', relationTo: 'media' },
    { name: 'items', type: 'array', fields: [{ name: 'quote', type: 'textarea' }, { name: 'author', type: 'text' }, { name: 'image', type: 'upload', relationTo: 'media' }] },
  ],
}

export const ctaBlock: Block = {
  slug: 'cta',
  interfaceName: 'CtaBlock',
  fields: [
    { name: 'heading', type: 'text' },
    { name: 'buttonLabel', type: 'text' },
    { name: 'image', type: 'upload', relationTo: 'media' },
  ],
}

export const contactBlock: Block = {
  slug: 'contact',
  interfaceName: 'ContactBlock',
  fields: [
    { name: 'heading', type: 'text' },
    { name: 'text', type: 'textarea' },
    { name: 'buttonLabel', type: 'text' },
    { name: 'image', type: 'upload', relationTo: 'media' },
  ],
}

export const richTextBlock: Block = {
  slug: 'richText',
  interfaceName: 'RichTextBlock',
  fields: [
    { name: 'heading', type: 'text' },
    { name: 'body', type: 'textarea' },
    { name: 'image', type: 'upload', relationTo: 'media' },
  ],
}

export const pageBlocks: Block[] = [heroBlock, featuresBlock, productsBlock, testimonialsBlock, ctaBlock, contactBlock, richTextBlock]

/** The block type slugs, for validation. */
export const BLOCK_TYPES = ['hero', 'features', 'products', 'testimonials', 'cta', 'contact', 'richText'] as const
export type BlockType = (typeof BLOCK_TYPES)[number]
