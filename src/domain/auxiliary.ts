import { isHanCharacter } from './han'

/** These targets never share a four-code mastery key or invent a character reading. */
export interface AuxiliaryPart {
  part: string
  pinyin: string
  code: string
  source: string
}

export interface AuxiliaryTarget {
  kind: 'component-spelling' | 'user-code'
  char: string
  code: string
  sourceLabel: string
  sourceId: string
  parts: readonly AuxiliaryPart[]
  sourceLine?: number
  confirmed: boolean
}

export function auxiliaryTargetKey(target: AuxiliaryTarget): string {
  return `${target.kind}:${target.sourceId}:${target.char}:${target.code}`
}

export interface AuxiliaryState {
  accepted: string
  typed: string
  error: { input: string; expected: string; position: number } | null
  hint: number
  assisted: boolean
  completed: boolean
}

export const initialAuxiliaryState = (): AuxiliaryState => ({ accepted: '', typed: '', error: null, hint: 0, assisted: false, completed: false })

export function typeAuxiliary(state: AuxiliaryState, target: AuxiliaryTarget, input: string): AuxiliaryState {
  if (state.completed || !/^[a-z]$/i.test(input)) return state
  const letter = input.toUpperCase(), position = state.accepted.length
  if (target.code[position] !== letter) return { ...state, typed: state.typed + letter, error: { input: letter, expected: target.code[position], position } }
  const accepted = state.accepted + letter
  return { ...state, accepted, typed: state.typed + letter, error: null, completed: accepted === target.code }
}

export function validateAuxiliaryTarget(target: AuxiliaryTarget): boolean {
  if (!isHanCharacter(target.char)) return false
  if (target.kind === 'user-code') return /^[A-Z]{4}$|^OK[A-Z]{4}(?:[A-Z]{2})?$/.test(target.code) && !!target.sourceId
  return /^OK[A-Z]{4}(?:[A-Z]{2})?$/.test(target.code) && [2, 3].includes(target.parts.length)
    && target.parts.every(part => Array.from(part.part).length === 1 && /^[A-Z]{2}$/.test(part.code) && !!part.pinyin && !!part.source)
    && `OK${target.parts.map(part => part.code).join('')}` === target.code
}
