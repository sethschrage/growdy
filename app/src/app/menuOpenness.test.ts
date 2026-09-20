import { describe, expect, it } from 'vitest'
import { SETTLE_AT, opennessFromDrag, settleOpenness } from '@/app/menuOpenness'

describe('dragging the menu open and shut', () => {
  it('shuts it as the finger carries it up', () => {
    // Up is negative, and the menu goes up when it shuts.
    expect(opennessFromDrag(1, -100, 400)).toBeCloseTo(0.75)
    expect(opennessFromDrag(1, -200, 400)).toBeCloseTo(0.5)
  })

  it('is fully shut when the finger has carried it the stack\'s own height', () => {
    expect(opennessFromDrag(1, -400, 400)).toBe(0)
  })

  it('does not go past shut however far the finger keeps going', () => {
    expect(opennessFromDrag(1, -900, 400)).toBe(0)
  })

  it('does not go past open when the finger goes the other way', () => {
    expect(opennessFromDrag(1, 200, 400)).toBe(1)
  })

  it('opens it from part-way when the finger comes back down', () => {
    expect(opennessFromDrag(0.25, 200, 400)).toBeCloseTo(0.75)
  })

  it('tracks the finger rather than a fixed distance', () => {
    // The same 100px means more on a short stack than a tall one,
    // because the gesture is "carry it to the top", not "move 100px".
    expect(opennessFromDrag(1, -100, 200)).toBeCloseTo(0.5)
    expect(opennessFromDrag(1, -100, 800)).toBeCloseTo(0.875)
  })

  it('leaves it where it was rather than answering NaN for an unmeasured stack', () => {
    // A height read from a ref before layout is 0, and NaN reaches the
    // stylesheet as a menu that cannot be drawn.
    expect(opennessFromDrag(0.6, -100, 0)).toBe(0.6)
  })
})

describe('where it lands when the finger comes off', () => {
  it('opens the rest of the way from past halfway', () => {
    expect(settleOpenness(0.51)).toBe(1)
    expect(settleOpenness(1)).toBe(1)
  })

  it('shuts from under halfway', () => {
    expect(settleOpenness(0.49)).toBe(0)
    expect(settleOpenness(0)).toBe(0)
  })

  it('opens from exactly halfway', () => {
    expect(settleOpenness(SETTLE_AT)).toBe(1)
  })
})
