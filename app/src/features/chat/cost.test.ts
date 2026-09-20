import { describe, expect, it } from 'vitest'
import { IDLE_THINKING } from '@/features/chat/thinking'
import {
  estimateCostUsd,
  estimateThinkingCostUsd,
  formatCostUsd,
} from '@/features/chat/cost'

// The point of this number is that a producer can trust it without
// checking, so the ways it can be quietly wrong are what get tested: a
// cached token priced as a fresh one, a cache write priced as a cheap
// read, and a real amount rounded away to zero.

describe('estimateCostUsd', () => {
  it('matches a request that was actually measured', () => {
    // Eight turns of a real weather question, billed at $0.065. If this
    // drifts, either a rate constant moved or the cache multipliers were
    // applied to the wrong component -- both of which look fine on
    // screen and are wrong by multiples.
    const usd = estimateCostUsd({
      inputTokens: 9_285,
      outputTokens: 1_892,
      cacheReadTokens: 135_504,
      cacheWriteTokens: 0,
    })
    expect(usd).toBeCloseTo(0.0646, 4)
    expect(formatCostUsd(usd)).toBe('6.5¢')
  })

  it('prices a cache read at a tenth, not at the input rate', () => {
    // This is the whole reason the feature exists. 135,504 tokens read
    // back out of the cache is 2.7 cents; the same count charged as
    // fresh input would be 27, and the token count on screen is
    // identical either way.
    const cached = estimateCostUsd({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 135_504,
      cacheWriteTokens: 0,
    })
    const fresh = estimateCostUsd({
      inputTokens: 135_504,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    expect(cached).toBeCloseTo(0.0271, 4)
    expect(fresh).toBeCloseTo(0.271, 3)
  })

  it('prices a cache write above a fresh token, not below it', () => {
    // The cold first question of a session: almost nothing fresh, the
    // whole prompt written into the cache at 1.25x. Treating that write
    // as ordinary input gives 3.5 cents for a request that cost 4.3, and
    // the cheap-looking direction is the dangerous one -- it is the
    // request the producer is most likely to be asking about.
    const usd = estimateCostUsd({
      inputTokens: 76,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheWriteTokens: 16_938,
    })
    expect(usd).toBeCloseTo(0.043, 3)
    expect(formatCostUsd(usd)).toBe('4.3¢')
  })

  it('charges output five times what it charges input', () => {
    // A long answer is the one thing that can make a small request
    // expensive, and it is invisible in a combined token total.
    const input = estimateCostUsd({
      inputTokens: 10_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    const output = estimateCostUsd({
      inputTokens: 0,
      outputTokens: 10_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    expect(output).toBeCloseTo(input * 5, 10)
  })

  it('costs nothing before anything has been reported', () => {
    expect(
      estimateCostUsd({
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ).toBe(0)
  })
})

describe('estimateThinkingCostUsd', () => {
  it('takes the reducer\'s combined input total back apart', () => {
    // The reducer adds fresh input, cache reads and cache writes into
    // one inputTokens total on purpose. Pricing that total as if it were
    // all fresh input would overcharge a cached request tenfold, so the
    // subtraction here is load-bearing.
    const state = {
      ...IDLE_THINKING,
      inputTokens: 9_285 + 135_504,
      outputTokens: 1_892,
      cachedTokens: 135_504,
      cacheWriteTokens: 0,
    }
    expect(estimateThinkingCostUsd(state)).toBeCloseTo(0.0646, 4)
  })

  it('separates a cache write from the fresh input it is folded in with', () => {
    // Same cold start as above, but arriving the way the status line
    // actually holds it: one input total of 17,014 with 16,938 of it
    // written. Getting this wrong shows 3.5 cents instead of 4.3.
    const state = {
      ...IDLE_THINKING,
      inputTokens: 76 + 16_938,
      outputTokens: 50,
      cachedTokens: 0,
      cacheWriteTokens: 16_938,
    }
    expect(estimateThinkingCostUsd(state)).toBeCloseTo(0.043, 3)
  })

  it('is free while the stream has reported no usage yet', () => {
    // The status line renders from IDLE_THINKING for the first second or
    // two of every request; a NaN here would reach the screen.
    expect(estimateThinkingCostUsd(IDLE_THINKING)).toBe(0)
  })
})

describe('formatCostUsd', () => {
  it('never rounds a real amount down to zero', () => {
    // 500 fresh input tokens is a tenth of a cent. Whole-cent rounding
    // prints "0¢", which tells the producer the request was free -- the
    // one claim this line must never make.
    expect(formatCostUsd(0.001)).toBe('0.1¢')
  })

  it('says "less than" rather than zero for an amount too small to show', () => {
    // A single small tool turn really can cost two thousandths of a
    // cent. It is not free and it is not worth three decimal places, so
    // the line gives a bound instead.
    expect(formatCostUsd(0.00002)).toBe('<0.1¢')
  })

  it('shows nothing spent as nothing spent', () => {
    // Only reachable before the first usage event; an exact zero is the
    // one time "0¢" is true.
    expect(formatCostUsd(0)).toBe('0¢')
  })

  it('keeps a decimal where a tenth of a cent still means something', () => {
    expect(formatCostUsd(0.0646)).toBe('6.5¢')
    expect(formatCostUsd(0.095)).toBe('9.5¢')
  })

  it('drops the decimal rather than printing "10.0¢"', () => {
    // toFixed(1) on 9.98 cents gives "10.0", which spends two characters
    // on a digit that carries nothing.
    expect(formatCostUsd(0.0998)).toBe('10¢')
    expect(formatCostUsd(0.42)).toBe('42¢')
  })

  it('switches to dollars once it is past one', () => {
    // "123.4¢" is not a number anybody reads. A request this expensive
    // has gone wrong and the line should look different when it has.
    expect(formatCostUsd(1.234)).toBe('$1.23')
    expect(formatCostUsd(12)).toBe('$12.00')
  })
})
