import { buildKeyDefinitions } from '../domain/mappings'
import { SAMPLE_CHARACTERS } from './characters'

/** Partial fixture associations only; empty keys do not imply no real mapping. */
export const KEY_DEFINITIONS = buildKeyDefinitions(SAMPLE_CHARACTERS)

export const KEYBOARD_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'] as const
