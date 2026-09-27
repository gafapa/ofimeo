// What the school configuration (src/core/school-config.ts) shows in the
// interface: the school's name and logo on the home screen, its privacy
// contacts next to the legal links, and "Set by your school" on locked settings.

import { t } from '../core/i18n'
import { schoolConfig } from '../core/school-config'
import { el } from './widgets'
import './school.css'

export const setBySchool = (): string => t('Set by your school')

// A small note for a setting the school locked.
export function lockedNote(): HTMLElement {
  return el('span', { class: 'school-locked', textContent: setBySchool() })
}

// School name (and logo) for the home screen header, or null.
export function schoolBadge(): HTMLElement | null {
  const school = schoolConfig().school
  if (!school?.name && !school?.logo) return null
  const logo = school.logo ? el('img', { class: 'school-logo', src: school.logo, alt: school.name ? '' : t('School logo') }) : null
  logo?.addEventListener('error', () => logo.remove())
  const content = [logo, school.name ? el('span', { class: 'school-name', textContent: school.name }) : null]
  const badge = school.url ? el('a', { class: 'school-badge', href: school.url, target: '_blank', rel: 'noopener' }, ...content) : el('span', { class: 'school-badge' }, ...content)
  badge.title = school.name ?? ''
  return badge
}

// Privacy contacts and pages of the school (legal.* of the configuration), or null.
export function schoolLegalNote(): HTMLElement | null {
  const legal = schoolConfig().legal
  if (!legal) return null
  const parts: (HTMLElement | string)[] = []
  const add = (label: string, node: HTMLElement) => {
    if (parts.length) parts.push(' · ')
    parts.push(`${label}: `, node)
  }
  const mail = (address: string) => el('a', { href: `mailto:${address}`, textContent: address })
  const link = (href: string, text: string) => el('a', { href, target: '_blank', rel: 'noopener', textContent: text })
  if (legal.organization) parts.push(t('Managed by {name}', { name: legal.organization }))
  if (legal.contactEmail) add(t('Contact'), mail(legal.contactEmail))
  if (legal.privacyEmail) add(t('Privacy'), mail(legal.privacyEmail))
  if (legal.dpoEmail) add(t('Data protection officer'), mail(legal.dpoEmail))
  if (legal.privacyUrl) add(t('School privacy policy'), link(legal.privacyUrl, new URL(legal.privacyUrl).host))
  if (legal.legalNoticeUrl) add(t('School legal notice'), link(legal.legalNoticeUrl, new URL(legal.legalNoticeUrl).host))
  return parts.length ? el('p', { class: 'school-legal' }, ...parts) : null
}
