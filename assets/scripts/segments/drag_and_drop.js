import { trackEvent } from '../app/event_tracking'
import { loseAnyFocus } from '../util/focus'
import { infoBubble } from '../info_bubble/info_bubble'
import { app } from '../preinit/app_settings'
import { system } from '../preinit/system_capabilities'
import { setIgnoreStreetChanges } from '../streets/data_model'
import { getElAbsolutePos } from '../util/helpers'
import { generateRandSeed } from '../util/random'
import { BUILDING_SPACE } from './buildings'
import {
  SegmentTypes,
  getSegmentInfo,
  getSegmentVariantInfo
} from './info'
import {
  SHORT_DELAY,
  RESIZE_TYPE_INITIAL,
  RESIZE_TYPE_DRAGGING,
  RESIZE_TYPE_PRECISE_DRAGGING,
  MIN_SEGMENT_WIDTH,
  resizeSegment,
  handleSegmentResizeEnd,
  normalizeSegmentWidth,
  scheduleControlsFadeout,
  cancelFadeoutControls,
  hideControls,
  cancelSegmentResizeTransitions
} from './resizing'
import { getVariantArray, getVariantString } from './variant_utils'
import { TILE_SIZE, DRAGGING_MOVE_HOLE_WIDTH } from './constants'
import {
  setSegmentContents,
  repositionSegments,
  segmentsChanged
} from './view'
import store from '../store'
import { addSegment, removeSegment } from '../store/actions/street'
import { clearMenus } from '../store/actions/menus'
import { updateDraggingState, clearDraggingState } from '../store/actions/ui'

const DRAG_OFFSET_Y_PALETTE = -340 - 150

export const DRAGGING_TYPE_NONE = 0
const DRAGGING_TYPE_CLICK_OR_MOVE = 1
export const DRAGGING_TYPE_MOVE = 2
export const DRAGGING_TYPE_RESIZE = 3

const DRAGGING_TYPE_MOVE_TRANSFER = 1
const DRAGGING_TYPE_MOVE_CREATE = 2

const MAX_DRAG_DEGREE = 20

var _draggingType = DRAGGING_TYPE_NONE

export function draggingType () {
  return _draggingType
}

export var draggingResize = {
  segmentEl: null,
  floatingEl: null,
  mouseX: null,
  mouseY: null,
  elX: null,
  elY: null,
  width: null,
  originalX: null,
  originalWidth: null,
  right: false
}

export var draggingMove = {
  type: null,
  active: false,
  withinCanvas: null,
  segmentBeforeEl: null,
  segmentAfterEl: null,
  mouseX: null,
  mouseY: null,
  el: null,
  elX: null,
  elY: null,
  originalEl: null,
  originalWidth: null,
  originalType: null,
  originalVariantString: null,
  originalRandSeed: null,
  floatingElVisible: false
}

export function changeDraggingType (newDraggingType) {
  _draggingType = newDraggingType

  document.body.classList.remove('segment-move-dragging')
  document.body.classList.remove('segment-resize-dragging')

  switch (_draggingType) {
    case DRAGGING_TYPE_RESIZE:
      document.body.classList.add('segment-resize-dragging')
      break
    case DRAGGING_TYPE_MOVE:
      document.body.classList.add('segment-move-dragging')
      break
  }
}

function handleSegmentResizeStart (event) {
  let x, y
  if (app.readOnly) {
    return
  }

  if (event.touches && event.touches[0]) {
    x = event.touches[0].pageX
    y = event.touches[0].pageY
  } else {
    x = event.pageX
    y = event.pageY
  }

  setIgnoreStreetChanges(true)

  var el = event.target

  changeDraggingType(DRAGGING_TYPE_RESIZE)

  var pos = getElAbsolutePos(el)

  draggingResize.right = el.classList.contains('drag-handle-right')

  draggingResize.floatingEl = document.createElement('div')
  draggingResize.floatingEl.classList.add('drag-handle')
  draggingResize.floatingEl.classList.add('floating')

  if (el.classList.contains('drag-handle-left')) {
    draggingResize.floatingEl.classList.add('drag-handle-left')
  } else {
    draggingResize.floatingEl.classList.add('drag-handle-right')
  }

  draggingResize.floatingEl.style.left = (pos[0] - document.querySelector('#street-section-outer').scrollLeft) + 'px'
  draggingResize.floatingEl.style.top = pos[1] + 'px'
  document.body.appendChild(draggingResize.floatingEl)

  draggingResize.mouseX = x
  draggingResize.mouseY = y

  draggingResize.elX = pos[0]
  draggingResize.elY = pos[1]

  draggingResize.originalX = draggingResize.elX
  draggingResize.originalWidth = parseFloat(el.parentNode.getAttribute('data-width'))
  draggingResize.segmentEl = el.parentNode

  draggingResize.segmentEl.classList.add('hover')

  // todo: refactor
  window.dispatchEvent(new window.CustomEvent('stmx:show_segment_guides', { detail: { dataNo: window.parseInt(draggingResize.segmentEl.dataNo, 10) } }))

  infoBubble.hide()
  infoBubble.hideSegment(true)
  cancelFadeoutControls()
  hideControls()

  window.setTimeout(function () {
    draggingResize.segmentEl.classList.add('hover')
  }, 0)
}

function handleSegmentResizeMove (event) {
  let x, y, resizeType
  if (event.touches && event.touches[0]) {
    x = event.touches[0].pageX
    y = event.touches[0].pageY
  } else {
    x = event.pageX
    y = event.pageY
  }

  var deltaX = x - draggingResize.mouseX

  var deltaFromOriginal = draggingResize.elX - draggingResize.originalX
  if (!draggingResize.right) {
    deltaFromOriginal = -deltaFromOriginal
  }

  draggingResize.elX += deltaX
  draggingResize.floatingEl.style.left = (draggingResize.elX - document.querySelector('#street-section-outer').scrollLeft) + 'px'

  draggingResize.width = draggingResize.originalWidth + (deltaFromOriginal / TILE_SIZE * 2)
  var precise = event.shiftKey

  if (precise) {
    resizeType = RESIZE_TYPE_PRECISE_DRAGGING
  } else {
    resizeType = RESIZE_TYPE_DRAGGING
  }

  resizeSegment(draggingResize.segmentEl.dataNo, resizeType, draggingResize.width, true, false)

  draggingResize.mouseX = x
  draggingResize.mouseY = y
}

// function handleSegmentClickOrMoveStart (event) {
//   let x, y
//   if (app.readOnly) {
//     return
//   }

//   setIgnoreStreetChanges(true)

//   if (event.touches && event.touches[0]) {
//     x = event.touches[0].pageX
//     y = event.touches[0].pageY
//   } else {
//     x = event.pageX
//     y = event.pageY
//   }

//   var el = event.target
//   draggingMove.originalEl = el

//   changeDraggingType(DRAGGING_TYPE_CLICK_OR_MOVE)

//   draggingMove.mouseX = x
//   draggingMove.mouseY = y
// }

function handleSegmentMoveStart () {
  if (app.readOnly) {
    return
  }

  changeDraggingType(DRAGGING_TYPE_MOVE)

  const inPalette = draggingMove.originalEl.classList.contains('segment-in-palette')
  const originalType = draggingMove.originalEl.getAttribute('type')
  const randSeed = draggingMove.originalEl.getAttribute('rand-seed')
  const variantString = draggingMove.originalEl.getAttribute('variant-string')

  draggingMove.originalType = originalType

  if (inPalette) {
    const segmentInfo = getSegmentInfo(draggingMove.originalType)
    if (segmentInfo.needRandSeed) {
      draggingMove.originalRandSeed = generateRandSeed()
    }
    draggingMove.type = DRAGGING_TYPE_MOVE_CREATE
    draggingMove.originalWidth = segmentInfo.defaultWidth * TILE_SIZE
    draggingMove.originalVariantString = Object.keys(segmentInfo.details).shift()
  } else {
    draggingMove.originalRandSeed = parseInt(randSeed)
    draggingMove.type = DRAGGING_TYPE_MOVE_TRANSFER
    draggingMove.originalWidth = draggingMove.originalEl.offsetWidth
    draggingMove.originalVariantString = variantString
  }

  // Only send `true` as the second argument if dragging occurs in palette to prevent offset of element
  const pos = getElAbsolutePos(draggingMove.originalEl, inPalette)

  draggingMove.elX = pos[0]
  draggingMove.elY = pos[1]

  if (draggingMove.type === DRAGGING_TYPE_MOVE_CREATE) {
    draggingMove.elY += DRAG_OFFSET_Y_PALETTE
    draggingMove.elX -= draggingMove.originalWidth / 3
  } else {
    draggingMove.elX -= document.querySelector('#street-section-outer').scrollLeft
  }

  draggingMove.floatingEl = document.createElement('div')
  draggingMove.floatingEl.classList.add('segment')
  draggingMove.floatingEl.classList.add('floating')
  draggingMove.floatingEl.classList.add('first-drag-move')
  draggingMove.floatingEl.setAttribute('type', draggingMove.originalType)
  draggingMove.floatingEl.setAttribute('variant-string',
    draggingMove.originalVariantString)
  draggingMove.floatingElVisible = false
  setSegmentContents(draggingMove.floatingEl,
    draggingMove.originalType,
    draggingMove.originalVariantString,
    draggingMove.originalWidth,
    draggingMove.originalRandSeed,
    false, false)
  document.body.appendChild(draggingMove.floatingEl)

  if (system.cssTransform) {
    draggingMove.floatingEl.style[system.cssTransform] =
      'translate(' + draggingMove.elX + 'px, ' + draggingMove.elY + 'px)'
  } else {
    draggingMove.floatingEl.style.left = draggingMove.elX + 'px'
    draggingMove.floatingEl.style.top = draggingMove.elY + 'px'
  }

  if (draggingMove.type === DRAGGING_TYPE_MOVE_TRANSFER) {
    draggingMove.originalEl.classList.add('dragged-out')
    draggingMove.originalEl.classList.remove('immediate-show-drag-handles')
    draggingMove.originalEl.classList.remove('show-drag-handles')
    draggingMove.originalEl.classList.remove('hover')
  }

  draggingMove.segmentBeforeEl = null
  draggingMove.segmentAfterEl = null
  updateWithinCanvas(true)

  infoBubble.hide()
  cancelFadeoutControls()
  hideControls()
}

function updateWithinCanvas (_newWithinCanvas) {
  draggingMove.withinCanvas = _newWithinCanvas

  if (draggingMove.withinCanvas) {
    document.body.classList.remove('not-within-canvas')
  } else {
    document.body.classList.add('not-within-canvas')
  }
}

function handleSegmentClickOrMoveMove (event) {
  let x, y
  if (event.touches && event.touches[0]) {
    x = event.touches[0].pageX
    y = event.touches[0].pageY
  } else {
    x = event.pageX
    y = event.pageY
  }

  var deltaX = x - draggingMove.mouseX
  var deltaY = y - draggingMove.mouseY

  // TODO const
  if ((Math.abs(deltaX) > 5) || (Math.abs(deltaY) > 5)) {
    handleSegmentMoveStart()
    handleSegmentMoveMove(event)
  }
}

function handleSegmentMoveMove (event) {
  let x, y
  if (event.touches && event.touches[0]) {
    x = event.touches[0].pageX
    y = event.touches[0].pageY
  } else {
    x = event.pageX
    y = event.pageY
  }

  var deltaX = x - draggingMove.mouseX
  var deltaY = y - draggingMove.mouseY

  draggingMove.elX += deltaX
  draggingMove.elY += deltaY

  if (!draggingMove.floatingElVisible) {
    draggingMove.floatingElVisible = true

    window.setTimeout(function () {
      draggingMove.floatingEl.classList.remove('first-drag-move')
    }, SHORT_DELAY)
  }

  if (system.cssTransform) {
    draggingMove.floatingEl.style[system.cssTransform] =
      'translate(' + draggingMove.elX + 'px, ' + draggingMove.elY + 'px)'

    var deg = deltaX

    if (deg > MAX_DRAG_DEGREE) {
      deg = MAX_DRAG_DEGREE
    } else if (deg < -MAX_DRAG_DEGREE) {
      deg = -MAX_DRAG_DEGREE
    }

    if (system.cssTransform) {
      draggingMove.floatingEl.querySelector('canvas').style[system.cssTransform] =
        'rotateZ(' + deg + 'deg)'
    }
  } else {
    draggingMove.floatingEl.style.left = draggingMove.elX + 'px'
    draggingMove.floatingEl.style.top = draggingMove.elY + 'px'
  }

  draggingMove.mouseX = x
  draggingMove.mouseY = y

  var newX = x - BUILDING_SPACE + document.querySelector('#street-section-outer').scrollLeft

  if (makeSpaceBetweenSegments(newX, y)) {
    var smartDrop = doDropHeuristics(draggingMove.originalType,
      draggingMove.originalVariantString, draggingMove.originalWidth)

    if ((smartDrop.type !== draggingMove.originalType) || (smartDrop.variantString !== draggingMove.originalVariantString)) {
      setSegmentContents(draggingMove.floatingEl,
        smartDrop.type,
        smartDrop.variantString,
        smartDrop.width,
        draggingMove.originalRandSeed, false, true)

      draggingMove.originalType = smartDrop.type
      draggingMove.originalVariantString = smartDrop.variantString
    }
  }

  if (draggingMove.type === DRAGGING_TYPE_MOVE_TRANSFER) {
    document.querySelector('.palette-trashcan').classList.add('visible')
  }
}

export function onBodyMouseDown (event) {
  let topEl, withinMenu
  var el = event.target

  if (app.readOnly || (event.touches && event.touches.length !== 1)) {
    return
  }

  topEl = event.target

  // For street width editing on Firefox

  while (topEl && (topEl.id !== 'street-width')) {
    topEl = topEl.parentNode
  }

  withinMenu = !!topEl

  if (withinMenu) {
    return
  }

  loseAnyFocus()

  topEl = event.target

  while (topEl && (topEl.id !== 'info-bubble') && (topEl.id !== 'street-width') &&
    ((!topEl.classList) ||
    ((!topEl.classList.contains('menu-attached')) &&
    (!topEl.classList.contains('menu'))))) {
    topEl = topEl.parentNode
  }

  withinMenu = !!topEl

  if (withinMenu) {
    return
  }

  store.dispatch(clearMenus())

  if (el.classList.contains('drag-handle')) {
    handleSegmentResizeStart(event)
  } else {
    if (!el.classList.contains('segment') ||
      el.classList.contains('unmovable')) {
      return
    }

    // handleSegmentClickOrMoveStart(event)
  }

  event.preventDefault()
}

// function makeSpaceBetweenSegments (x, y) {
//   let farLeft, farRight
//   const street = store.getState().street
//   const streetSectionCanvasLeft = document.querySelector('#street-section-canvas').style.left
//   var left = x - Number.parseFloat(streetSectionCanvasLeft)

//   var selectedSegmentBefore = null
//   var selectedSegmentAfter = null

//   if (street.segments.length) {
//     farLeft = street.segments[0].el.savedNoMoveLeft
//     farRight =
//     street.segments[street.segments.length - 1].el.savedNoMoveLeft +
//       street.segments[street.segments.length - 1].el.savedWidth
//   } else {
//     farLeft = 0
//     farRight = street.width * TILE_SIZE
//   }
//   // TODO const
//   var space = (street.width - street.occupiedWidth) * TILE_SIZE / 2
//   if (space < 100) {
//     space = 100
//   }

//   // TODO const
//   if ((left < farLeft - space) || (left > farRight + space) ||
//     (y < getStreetSectionTop() - 100) || (y > getStreetSectionTop() + 300)) {
//     updateWithinCanvas(false)
//   } else {
//     updateWithinCanvas(true)
//     for (var i in street.segments) {
//       var segment = street.segments[i]

//       if (!selectedSegmentBefore && ((segment.el.savedLeft + (segment.el.savedWidth / 2)) > left)) {
//         selectedSegmentBefore = segment.el
//       }

//       if ((segment.el.savedLeft + (segment.el.savedWidth / 2)) <= left) {
//         selectedSegmentAfter = segment.el
//       }
//     }
//   }

//   if ((selectedSegmentBefore !== draggingMove.segmentBeforeEl) ||
//     (selectedSegmentAfter !== draggingMove.segmentAfterEl)) {
//     draggingMove.segmentBeforeEl = selectedSegmentBefore
//     draggingMove.segmentAfterEl = selectedSegmentAfter
//     repositionSegments()
//     return true
//   } else {
//     return false
//   }
// }

export function onBodyMouseMove (event) {
  if (_draggingType === DRAGGING_TYPE_NONE) {
    return
  }

  switch (_draggingType) {
    case DRAGGING_TYPE_CLICK_OR_MOVE:
      handleSegmentClickOrMoveMove(event)
      break
    case DRAGGING_TYPE_MOVE:
      handleSegmentMoveMove(event)
      break
    case DRAGGING_TYPE_RESIZE:
      handleSegmentResizeMove(event)
      break
  }

  event.preventDefault()
}

function doDropHeuristics (type, variantString, width) {
  // Automatically figure out width
  const street = store.getState().street

  if (draggingMove.type === DRAGGING_TYPE_MOVE_CREATE) {
    if ((street.remainingWidth > 0) &&
      (width > street.remainingWidth * TILE_SIZE)) {
      var segmentMinWidth = getSegmentVariantInfo(type, variantString).minWidth || 0

      if ((street.remainingWidth >= MIN_SEGMENT_WIDTH) &&
        (street.remainingWidth >= segmentMinWidth)) {
        width = normalizeSegmentWidth(street.remainingWidth, RESIZE_TYPE_INITIAL) * TILE_SIZE
      }
    }
  }

  // Automatically figure out variants

  var leftEl = draggingMove.segmentAfterEl
  var rightEl = draggingMove.segmentBeforeEl

  var left = leftEl ? street.segments[leftEl.dataNo] : null
  var right = rightEl ? street.segments[rightEl.dataNo] : null

  var leftOwner = left && SegmentTypes[getSegmentInfo(left.type).owner]
  var rightOwner = right && SegmentTypes[getSegmentInfo(right.type).owner]

  var leftOwnerAsphalt = (leftOwner === SegmentTypes.CAR) ||
    (leftOwner === SegmentTypes.BIKE) ||
    (leftOwner === SegmentTypes.TRANSIT)
  var rightOwnerAsphalt = (rightOwner === SegmentTypes.CAR) ||
    (rightOwner === SegmentTypes.BIKE) ||
    (rightOwner === SegmentTypes.TRANSIT)

  var leftVariant = left && getVariantArray(left.type, left.variantString)
  var rightVariant = right && getVariantArray(right.type, right.variantString)

  var variant = getVariantArray(type, variantString)
  const segmentInfo = getSegmentInfo(type)

  // Direction

  if (segmentInfo.variants.indexOf('direction') !== -1) {
    if (leftVariant && leftVariant['direction']) {
      variant['direction'] = leftVariant['direction']
    } else if (rightVariant && rightVariant['direction']) {
      variant['direction'] = rightVariant['direction']
    }
  }

  // Parking lane orientation

  if (segmentInfo.variants.indexOf('parking-lane-orientation') !== -1) {
    if (!right || !rightOwnerAsphalt) {
      variant['parking-lane-orientation'] = 'right'
    } else if (!left || !leftOwnerAsphalt) {
      variant['parking-lane-orientation'] = 'left'
    }
  }

  // Parklet orientation

  if (type === 'parklet') {
    if (left && leftOwnerAsphalt) {
      variant['orientation'] = 'right'
    } else if (right && rightOwnerAsphalt) {
      variant['orientation'] = 'left'
    }
  }

  // Turn lane orientation

  if (segmentInfo.variants.indexOf('turn-lane-orientation') !== -1) {
    if (!right || !rightOwnerAsphalt) {
      variant['turn-lane-orientation'] = 'right'
    } else if (!left || !leftOwnerAsphalt) {
      variant['turn-lane-orientation'] = 'left'
    }
  }

  // Transit shelter orientation and elevation

  if (type === 'transit-shelter') {
    if (left && (leftOwner === SegmentTypes.TRANSIT)) {
      variant['orientation'] = 'right'
    } else if (right && (rightOwner === SegmentTypes.TRANSIT)) {
      variant['orientation'] = 'left'
    }
  }

  if (segmentInfo.variants.indexOf('transit-shelter-elevation') !== -1) {
    if (variant['orientation'] === 'right' && left && left.type === 'light-rail') {
      variant['transit-shelter-elevation'] = 'light-rail'
    } else if (variant['orientation'] === 'left' && right && right.type === 'light-rail') {
      variant['transit-shelter-elevation'] = 'light-rail'
    }
  }

  // Bike rack orientation

  if (type === 'sidewalk-bike-rack') {
    if (left && (leftOwner !== SegmentTypes.PEDESTRIAN)) {
      variant['orientation'] = 'left'
    } else if (right && (rightOwner !== SegmentTypes.PEDESTRIAN)) {
      variant['orientation'] = 'right'
    }
  }

  // Lamp orientation

  if (segmentInfo.variants.indexOf('lamp-orientation') !== -1) {
    if (left && right && leftOwnerAsphalt && rightOwnerAsphalt) {
      variant['lamp-orientation'] = 'both'
    } else if (left && leftOwnerAsphalt) {
      variant['lamp-orientation'] = 'left'
    } else if (right && rightOwnerAsphalt) {
      variant['lamp-orientation'] = 'right'
    } else if (left && right) {
      variant['lamp-orientation'] = 'both'
    } else if (left) {
      variant['lamp-orientation'] = 'left'
    } else if (right) {
      variant['lamp-orientation'] = 'right'
    } else {
      variant['lamp-orientation'] = 'both'
    }
  }

  variantString = getVariantString(variant)

  return { type: type, variantString: variantString, width: width }
}

export function handleSegmentMoveCancel () {
  draggingMove.originalEl.classList.remove('dragged-out')

  draggingMove.segmentBeforeEl = null
  draggingMove.segmentAfterEl = null

  repositionSegments()
  updateWithinCanvas(true)

  draggingMove.floatingEl.remove()
  document.querySelector('.palette-trashcan').classList.remove('visible')

  changeDraggingType(DRAGGING_TYPE_NONE)
}

function handleSegmentMoveEnd (event) {
  setIgnoreStreetChanges(false)

  var failedDrop = false

  var segmentElControls = null

  if (!draggingMove.withinCanvas) {
    if (draggingMove.type === DRAGGING_TYPE_MOVE_TRANSFER) {
      // This deletes a segment when it's dragged out of the street
      store.dispatch(removeSegment(Number.parseInt(draggingMove.originalEl.dataNo)))
    }

    trackEvent('INTERACTION', 'REMOVE_SEGMENT', 'DRAGGING', null, true)
  } else if (draggingMove.segmentBeforeEl || draggingMove.segmentAfterEl || (store.getState().street.segments.length === 0)) {
    var smartDrop = doDropHeuristics(draggingMove.originalType,
      draggingMove.originalVariantString, draggingMove.originalWidth)

    const newSegment = {
      variantString: smartDrop.variantString,
      width: smartDrop.width / TILE_SIZE,
      type: smartDrop.type,
      randSeed: draggingMove.originalRandSeed
    }

    const oldIndex = Number.parseInt(draggingMove.originalEl.dataNo)
    let newIndex = (draggingMove.segmentBeforeEl && Number.parseInt(draggingMove.segmentBeforeEl.dataNo)) ||
                    (draggingMove.segmentAfterEl && Number.parseInt(draggingMove.segmentAfterEl.dataNo) + 1) || 0

    if (draggingMove.segmentBeforeEl) {
      newIndex = (newIndex > oldIndex) ? newIndex - 1 : newIndex
    }

    cancelSegmentResizeTransitions()

    if (draggingMove.type === DRAGGING_TYPE_MOVE_TRANSFER) {
      const originalSegmentId = store.getState().street.segments[oldIndex].id
      newSegment.id = originalSegmentId

      store.dispatch(removeSegment(oldIndex))
      store.dispatch(addSegment(newIndex, newSegment))
    } else {
      store.dispatch(addSegment(newIndex, newSegment))
    }

    const segment = store.getState().street.segments[newIndex]
    segmentElControls = (segment && segment.el)
  } else {
    failedDrop = true

    draggingMove.originalEl.classList.remove('dragged-out')

    segmentElControls = draggingMove.originalEl
  }

  draggingMove.originalEl.classList.remove('dragged-out')
  draggingMove.segmentBeforeEl = null
  draggingMove.segmentAfterEl = null

  repositionSegments()
  segmentsChanged()
  updateWithinCanvas(true)

  draggingMove.floatingEl.remove()
  document.querySelector('.palette-trashcan').classList.remove('visible')

  changeDraggingType(DRAGGING_TYPE_NONE)

  if (segmentElControls) {
    scheduleControlsFadeout(segmentElControls)
  }

  if (failedDrop) {
    infoBubble.show(true)
  }
}

export function onBodyMouseUp (event) {
  switch (_draggingType) {
    case DRAGGING_TYPE_NONE:
      return
    case DRAGGING_TYPE_CLICK_OR_MOVE:
      changeDraggingType(DRAGGING_TYPE_NONE)
      setIgnoreStreetChanges(false)
      break
    case DRAGGING_TYPE_MOVE:
      handleSegmentMoveEnd(event)
      break
    case DRAGGING_TYPE_RESIZE:
      handleSegmentResizeEnd(event)
      break
  }

  event.preventDefault()
}

function handleSegmentDragStart (segment, fromPalette) {
  if (!fromPalette) {
    segment.classList.remove('immediate-show-drag-handles')
    segment.classList.remove('show-drag-handles')
    segment.classList.remove('hover')
    document.querySelector('.palette-trashcan').classList.add('visible')
  }

  document.body.classList.add('segment-move-dragging')
  infoBubble.hide()
  cancelFadeoutControls()
  hideControls()
}

export const Types = {
  SEGMENT: 'segment'
}

export const segmentSource = {
  canDrag (props) {
    return !(props.isUnmovable)
  },

  isDragging (props, monitor) {
    return monitor.getItem().dataNo === props.dataNo
  },

  beginDrag (props, monitor, component) {
    handleSegmentDragStart(component.streetSegment, props.forPalette)
    const segmentInfo = getSegmentInfo(props.type)

    return {
      dataNo: (props.forPalette) ? undefined : props.dataNo,
      variantString: (props.forPalette) ? Object.keys(segmentInfo.details).shift() : props.variantString,
      type: props.type,
      randSeed: (props.forPalette && segmentInfo.needRandSeed) ? generateRandSeed() : props.randSeed,
      forPalette: props.forPalette,
      width: (props.forPalette) ? (segmentInfo.defaultWidth * TILE_SIZE) : props.width
    }
  },

  endDrag (props, monitor, component) {
    if (!monitor.didDrop()) {
      // if no object returned by a drop handler, it is not within the canvas
      if (!props.forPalette) {
        // if existing segment is dropped outside canvas, delete it
        store.dispatch(removeSegment(props.dataNo))
        segmentsChanged(false)
      }
    }

    store.dispatch(clearDraggingState())
    cancelSegmentResizeTransitions()
    infoBubble.show(true)
    document.querySelector('.palette-trashcan').classList.remove('visible')
    document.body.classList.remove('segment-move-dragging')
  }
}

export function collectDragSource (connect, monitor) {
  return {
    connectDragSource: connect.dragSource(),
    connectDragPreview: connect.dragPreview(),
    isDragging: monitor.isDragging()
  }
}

export function makeSpaceBetweenSegments (dataNo, draggingState) {
  const { segmentBeforeEl, segmentAfterEl } = draggingState
  let spaceBetweenSegments = 0

  if (dataNo >= segmentBeforeEl) {
    spaceBetweenSegments += DRAGGING_MOVE_HOLE_WIDTH

    if (segmentAfterEl === undefined) {
      spaceBetweenSegments += DRAGGING_MOVE_HOLE_WIDTH
    }
  }

  if (dataNo > segmentAfterEl) {
    spaceBetweenSegments += DRAGGING_MOVE_HOLE_WIDTH

    if (segmentBeforeEl === undefined) {
      spaceBetweenSegments += DRAGGING_MOVE_HOLE_WIDTH
    }
  }

  return spaceBetweenSegments
}

export const segmentTarget = {
  canDrop (props, monitor) {
    return !(props.forPalette)
  },

  hover (props, monitor, component) {
    if (!monitor.canDrop()) return

    const dragIndex = monitor.getItem().dataNo
    const hoverIndex = props.dataNo

    const hoveredSegment = component.getDecoratedComponentInstance().streetSegment
    const { left } = hoveredSegment.getBoundingClientRect()
    const hoverMiddleX = Math.round(left + (props.width) / 2)
    const { x } = monitor.getClientOffset()

    if (dragIndex === hoverIndex) {
      store.dispatch(updateDraggingState(dragIndex, undefined, dragIndex))
    } else {
      const { segments } = store.getState().street

      const segmentBeforeEl = (x > hoverMiddleX && hoverIndex !== segments.length - 1) ? hoverIndex + 1
        : (hoverIndex === segments.length - 1) ? undefined
          : hoverIndex

      const segmentAfterEl = (x > hoverMiddleX && hoverIndex !== 0) ? hoverIndex
        : (hoverIndex === 0) ? undefined
          : hoverIndex - 1

      store.dispatch(updateDraggingState(segmentBeforeEl, segmentAfterEl, dragIndex))
    }
  },

  drop (props, monitor, component) {
    return { withinCanvas: true }
  }
}

// When dragging a segment, react-dnd registers when the dragged segment
// is over another segment. However, if the dragged segment is not over
// any segment targets, then it triggers the canvasTarget. react-dnd does
// not allow an easy way to figure out which side of the canvas the dragged
// segment is, so this function will compare the end of the left empty segment
// and beginning of the right empty segment with the dropped position.
function handleSegmentCanvasDrop (position, draggedItem) {
  const { segments } = store.getState().street
  const newSegment = {
    variantString: draggedItem.variantString,
    width: draggedItem.width / TILE_SIZE,
    type: draggedItem.type,
    randSeed: draggedItem.randSeed
  }

  const index = (position && position === 'right') ? segments.length : 0

  if (draggedItem.forPalette) {
    store.dispatch(addSegment(index, newSegment))
    cancelSegmentResizeTransitions()
    segmentsChanged(false)
  }
}

function isOverLeftOrRightCanvas (segment, droppedPosition) {
  const { remainingWidth } = store.getState().street
  const { left, right } = segment.getBoundingClientRect()

  const emptySegmentWidth = (remainingWidth * TILE_SIZE) / 2

  return (droppedPosition < left + emptySegmentWidth) ? 'left'
    : (droppedPosition > right - emptySegmentWidth) ? 'right'
      : null
}

export const canvasTarget = {
  hover (props, monitor, component) {
    if (!monitor.canDrop()) return

    const position = isOverLeftOrRightCanvas(component.streetSectionEditable, monitor.getClientOffset().x)
    if (position) {
      const { segments } = store.getState().street
      const dragIndex = monitor.getItem().dataNo
      const segmentBeforeEl = (position === 'left') ? 0 : undefined
      const segmentAfterEl = (position === 'left') ? undefined : segments.length - 1
      store.dispatch(updateDraggingState(segmentBeforeEl, segmentAfterEl, dragIndex))
    }
  },

  drop (props, monitor, component) {
    // If dragged segment was not handled by segmentTarget,
    // then it was dropped over one of the empty segments.
    if (!monitor.didDrop()) {
      const draggedItem = monitor.getItem()
      const position = isOverLeftOrRightCanvas(component.streetSectionEditable, monitor.getClientOffset().x)
      handleSegmentCanvasDrop(position, draggedItem)
    }

    return { withinCanvas: true }
  }
}

export function collectDropTarget (connect, monitor) {
  return {
    connectDropTarget: connect.dropTarget(),
    isOver: monitor.isOver(),
    isOverCurrent: monitor.isOver({ shallow: true })
  }
}
