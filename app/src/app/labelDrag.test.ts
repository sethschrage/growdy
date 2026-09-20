import { describe, expect, it } from 'vitest'
import {
  LABEL_COMMIT_AT,
  LABEL_WIDTH_KEY,
  nearestEnd,
  settleLabelWidth,
  TAP_SLOP,
  WIDEST_LABEL,
  isTap,
  recallLabelWidth,
  rememberLabelWidth,
  widthAfterTap,
  widthFromDrag,
} from '@/app/labelDrag'

// The handle sits on both menus, which hang off opposite edges, so every
// rule here has a mirror that has to hold too.

describe('widthFromDrag', () => {
  it('widens the right-hand menu when the finger goes left', () => {
    // Its labels grow toward the middle of the screen, which is left.
    expect(widthFromDrag(0, -60, 'left')).toBe(60)
  })

  it('widens the left-hand menu when the finger goes right', () => {
    expect(widthFromDrag(0, 60, 'right')).toBe(60)
  })

  it('narrows again on the way back', () => {
    expect(widthFromDrag(100, 40, 'left')).toBe(60)
    expect(widthFromDrag(100, -40, 'right')).toBe(60)
  })

  it('stops at shut rather than going past it', () => {
    // Dragging the wrong way forever must not leave a negative width to
    // be read back as a label wider than the menu.
    expect(widthFromDrag(20, 500, 'left')).toBe(0)
    expect(widthFromDrag(20, -500, 'right')).toBe(0)
  })

  it('stops at the longest label rather than opening onto empty space', () => {
    expect(widthFromDrag(100, -900, 'left')).toBe(WIDEST_LABEL)
    expect(widthFromDrag(100, 900, 'right')).toBe(WIDEST_LABEL)
  })

  it('starts from where the last drag left it, not from zero', () => {
    expect(widthFromDrag(80, -20, 'left')).toBe(100)
  })
})

describe('isTap', () => {
  it('forgives the wobble in a finger', () => {
    // A tap on a phone routinely travels two or three pixels. Reading
    // those as a drag would shave the menu narrower on every tap.
    expect(isTap(0)).toBe(true)
    expect(isTap(TAP_SLOP - 1)).toBe(true)
  })

  it('calls a real movement a drag', () => {
    expect(isTap(TAP_SLOP)).toBe(false)
    expect(isTap(40)).toBe(false)
  })
})

describe('widthAfterTap', () => {
  it('goes all the way, either way', () => {
    // A tap should never leave the menu at a width nobody chose.
    expect(widthAfterTap(0)).toBe(WIDEST_LABEL)
    expect(widthAfterTap(WIDEST_LABEL)).toBe(0)
    expect(widthAfterTap(37)).toBe(0)
  })
})

describe('remembering the width', () => {
  function fakeStore(initial: Record<string, string> = {}) {
    const items = { ...initial }
    return {
      items,
      getItem: (key: string) => items[key] ?? null,
      setItem: (key: string, value: string) => void (items[key] = value),
    }
  }

  it('writes the width under its own key', () => {
    const store = fakeStore()
    rememberLabelWidth(120, store)
    expect(store.items[LABEL_WIDTH_KEY]).toBe('120')
  })

  it('rounds, so a drag does not save a fraction of a pixel', () => {
    const store = fakeStore()
    rememberLabelWidth(119.6, store)
    expect(store.items[LABEL_WIDTH_KEY]).toBe('120')
  })

  it('reads back what it wrote', () => {
    const store = fakeStore()
    rememberLabelWidth(WIDEST_LABEL, store)
    expect(recallLabelWidth(store)).toBe(WIDEST_LABEL)
  })

  it('opens at a resting place, not at a width saved mid-drag', () => {
    // Every phone that ran the version where a drag could end anywhere
    // has one of these in storage, and opening into it means opening
    // with every label cut off mid-word.
    expect(recallLabelWidth(fakeStore({ [LABEL_WIDTH_KEY]: '96' }))).toBe(WIDEST_LABEL)
    expect(recallLabelWidth(fakeStore({ [LABEL_WIDTH_KEY]: '40' }))).toBe(0)
  })

  it('remembers a collapsed menu as collapsed, not as unset', () => {
    // The case the producer actually asked for: collapsing the labels
    // is a decision, and 0 has to round-trip as a saved width rather
    // than as "nothing saved".
    const store = fakeStore()
    rememberLabelWidth(0, store)
    expect(recallLabelWidth(store)).toBe(0)
  })

  it('opens at full width when nothing has been saved', () => {
    expect(recallLabelWidth(fakeStore())).toBe(WIDEST_LABEL)
  })

  it('ignores a saved value that is not a number', () => {
    expect(recallLabelWidth(fakeStore({ [LABEL_WIDTH_KEY]: 'wide' }))).toBe(WIDEST_LABEL)
  })

  it('clamps a saved width wider than the labels are', () => {
    expect(recallLabelWidth(fakeStore({ [LABEL_WIDTH_KEY]: '9000' }))).toBe(WIDEST_LABEL)
  })

  it('clamps a negative saved width to collapsed', () => {
    expect(recallLabelWidth(fakeStore({ [LABEL_WIDTH_KEY]: '-40' }))).toBe(0)
  })

  it('opens at full width where there is no storage at all', () => {
    // A WebView with site data blocked: browserStore() answers null.
    expect(recallLabelWidth(null)).toBe(WIDEST_LABEL)
  })

  it('survives a storage that throws on read', () => {
    const store = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    }
    expect(recallLabelWidth(store)).toBe(WIDEST_LABEL)
  })

  it('survives a storage that throws on write', () => {
    const store = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(() => rememberLabelWidth(80, store)).not.toThrow()
  })
})

describe('where the labels come to rest', () => {
  it('opens from a pull of more than a seventh of the way', () => {
    // The producer's number: about 15%.
    expect(settleLabelWidth(0, WIDEST_LABEL * 0.2)).toBe(WIDEST_LABEL)
  })

  it('shuts from a push of the same', () => {
    expect(settleLabelWidth(WIDEST_LABEL, WIDEST_LABEL * 0.8)).toBe(0)
  })

  it('reads exactly the threshold as a decision', () => {
    expect(settleLabelWidth(0, WIDEST_LABEL * LABEL_COMMIT_AT)).toBe(WIDEST_LABEL)
  })

  it('goes back where it came from on a smaller movement', () => {
    expect(settleLabelWidth(0, WIDEST_LABEL * 0.1)).toBe(0)
    expect(settleLabelWidth(WIDEST_LABEL, WIDEST_LABEL * 0.95)).toBe(WIDEST_LABEL)
  })

  it('never comes to rest between the two, whatever it is handed', () => {
    for (const start of [0, 45, 90, 135, WIDEST_LABEL]) {
      for (const end of [0, 20, 60, 96, 140, WIDEST_LABEL]) {
        expect([0, WIDEST_LABEL]).toContain(settleLabelWidth(start, end))
      }
    }
  })

  it('answers shut for a menu with no labels to show', () => {
    expect(settleLabelWidth(0, 50, 0)).toBe(0)
  })
})

describe('the nearer resting place', () => {
  it('rounds the halfway width outward to open', () => {
    expect(nearestEnd(WIDEST_LABEL / 2)).toBe(WIDEST_LABEL)
    expect(nearestEnd(WIDEST_LABEL / 2 - 1)).toBe(0)
  })
})
