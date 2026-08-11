import { selectedElements, selectedCursors } from './state.js';
import { imgToCode } from '../io.js';
import { toggleToEl } from '../ui/dom.js';
import { parsePathD, convertSegmentToQuadratic } from './paths.js';
import { beginDragNode } from './interaction.js';

export const selectedControlHandles = []; // array per selected element: array of groups

function ensureSelected(el) {
    if (!selectedElements.includes(el)) {
        // call the exported selectElement function (declared later) to select without toggling off
        selectElement(el);
    }
}

function createHandlesForElement(el, options = {interactiveEndpoints: false, forSelection:false}) {
    const svgcursors = document.getElementById('svgcursors').querySelector('svg');
    const cmds = parsePathD(el.getAttribute('d'));
    // determine current zoom (svg units per client pixel)
    const imgsvg = document.getElementById('svgimg').querySelector('svg');
    let svgWidth = imgsvg.getAttribute('width');
    const viewBoxAttr = imgsvg.getAttribute('viewBox');
    if (!svgWidth) {
        if (viewBoxAttr) svgWidth = viewBoxAttr.split(' ')[2];
    }
    svgWidth = Number(svgWidth);
    const zoom = svgWidth / imgsvg.clientWidth; // svg units per client pixel
    const desiredHandlePixelRadius = 8; // px
    const desiredLinePx = 1.5;

    // Ensure overlay svg uses same viewBox / coordinate system as main svg so handle positions match clicks
    try {
        if (viewBoxAttr) {
            svgcursors.setAttribute('viewBox', viewBoxAttr);
        } else {
            // fall back: construct a viewBox using computed svgWidth and proportional height
            const svgHeight = imgsvg.getAttribute('height') || String(Math.round(svgWidth * (imgsvg.clientHeight / imgsvg.clientWidth)));
            svgcursors.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
        }
        // copy preserveAspectRatio if present
        const par = imgsvg.getAttribute('preserveAspectRatio');
        if (par) svgcursors.setAttribute('preserveAspectRatio', par);
    } catch (err) {
        // ignore if overlay not present yet
        console.warn('Could not sync overlay svg viewBox', err);
    }

    const endpointHandles = [];
    const bendHandles = [];
    const controlHandles = [];
    let prevX = null, prevY = null;
    cmds.forEach((c, idx) => {
        // prepare endpoint handles (append later to ensure they render on top)
        if (c.cmd === 'M' || c.cmd === 'L' || c.cmd === 'Q') {
            const ep = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            ep.setAttribute('class', 'endpoint-handle');
            const ec = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            ec.setAttribute('r', String((desiredHandlePixelRadius-3) * zoom));
            ec.setAttribute('fill', 'white');
            ec.setAttribute('stroke', 'black');
            ec.setAttribute('stroke-width', String(1.5 * zoom));
            // make endpoint interactive if requested
            if (options.interactiveEndpoints) {
                ec.setAttribute('pointer-events', 'all');
                ec.style.cursor = 'pointer';
                ec.addEventListener('mousedown', (ev) => {
                    ev.stopPropagation();
                    ensureSelected(el);
                    beginDragNode({el, x: c.x, y: c.y, cmdIndex: idx, type: 'endpoint'});
                });
                const onEndpointPointer = (ev) => {
                    try { ev.preventDefault(); } catch (err) { /* ignore */ }
                    ev.stopPropagation();
                    if (ev.pointerId && ev.target && ev.target.setPointerCapture) {
                        try { ev.target.setPointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
                    }
                    ensureSelected(el);
                    beginDragNode({el, x: c.x, y: c.y, cmdIndex: idx, type: 'endpoint'});
                };
                ec.addEventListener('touchstart', onEndpointPointer, {passive: false});
                ec.addEventListener('pointerdown', onEndpointPointer);
            } else {
                ec.setAttribute('pointer-events', 'none');
            }
            ec.setAttribute('cx', c.x);
            ec.setAttribute('cy', c.y);
            ep.appendChild(ec);
            endpointHandles.push(ep);
        }

        // prepare bend-handle (midpoint) for straight L segments when rendering selection handles
        if (options.forSelection && c.cmd === 'L' && prevX !== null) {
            const midX = (prevX + c.x) / 2;
            const midY = (prevY + c.y) / 2;
            const bh = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            bh.setAttribute('class', 'bend-handle');
            const bc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            bc.setAttribute('r', String((desiredHandlePixelRadius-4) * zoom));
            bc.setAttribute('fill', 'rgba(0,128,255,0.9)');
            bc.setAttribute('stroke', 'black');
            bc.setAttribute('stroke-width', String(1 * zoom));
            // decide whether bend handle is too close to endpoints; if so, disable pointer events to avoid blocking endpoints
            const endpointRadiusSvg = (desiredHandlePixelRadius-3) * zoom;
            const distToPrev = Math.hypot(midX - prevX, midY - prevY);
            const distToCur = Math.hypot(midX - c.x, midY - c.y);
            const minDist = Math.min(distToPrev, distToCur);
            if (minDist <= endpointRadiusSvg * 1.2) {
                // if too close, offset the bend handle slightly outward along the segment normal so it's visible
                const dx = c.x - prevX;
                const dy = c.y - prevY;
                const segLen = Math.hypot(dx, dy) || 1;
                // normal vector
                const nx = -dy / segLen;
                const ny = dx / segLen;
                const offsetPx = 8; // visual offset in screen pixels
                const offsetSvg = offsetPx * zoom; // convert to svg units
                const ox = nx * offsetSvg;
                const oy = ny * offsetSvg;
                bc.setAttribute('pointer-events', 'all');
                bc.style.cursor = 'pointer';
                bc.setAttribute('cx', midX + ox);
                bc.setAttribute('cy', midY + oy);
                // attach handler using original mid coords for conversion but use event position to avoid stealing near-endpoint drags
                const onBendPointerOffset = (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    // compute svg-space event position
                    const imgsvg = document.getElementById('svgimg').querySelector('svg');
                    const rect = imgsvg.getBoundingClientRect();
                    const viewBox = imgsvg.getAttribute('viewBox');
                    let svgWidthLocal = imgsvg.getAttribute('width');
                    if (!svgWidthLocal && viewBox) svgWidthLocal = viewBox.split(' ')[2];
                    svgWidthLocal = Number(svgWidthLocal);
                    const zoomLocal = svgWidthLocal / imgsvg.clientWidth;
                    let clientX = ev.clientX || (ev.touches && ev.touches[0] && ev.touches[0].clientX) || 0;
                    let clientY = ev.clientY || (ev.touches && ev.touches[0] && ev.touches[0].clientY) || 0;
                    const sx = (clientX - rect.left) * zoomLocal;
                    const sy = (clientY - rect.top) * zoomLocal;
                    const d1 = Math.hypot(sx - prevX, sy - prevY);
                    const d2 = Math.hypot(sx - c.x, sy - c.y);
                    const endpointRadiusSvgLocal = (desiredHandlePixelRadius-3) * zoomLocal;
                    const threshold = endpointRadiusSvgLocal * 1.2;
                    if (d1 <= threshold || d2 <= threshold) {
                        // let endpoint handler handle it
                        return;
                    }
                    ensureSelected(el);
                    const res = convertSegmentToQuadratic(el, idx, midX, midY);
                    if (res) {
                        redrawCursors();
                        beginDragNode({el, x: res.cx, y: res.cy, cmdIndex: res.cmdIndex, type: 'control'});
                    }
                };
                bc.addEventListener('mousedown', onBendPointerOffset);
                bc.addEventListener('touchstart', onBendPointerOffset, {passive: false});
                bc.addEventListener('pointerdown', (ev) => {
                    try { ev.preventDefault(); } catch (err) { /* ignore */ }
                    ev.stopPropagation();
                    if (ev.pointerId && ev.target && ev.target.setPointerCapture) {
                        try { ev.target.setPointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
                    }
                    onBendPointerOffset(ev);
                });
            } else {
                bc.setAttribute('pointer-events', 'all');
                bc.style.cursor = 'pointer';
                const onBendPointer = (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    // compute svg-space event position
                    const imgsvg = document.getElementById('svgimg').querySelector('svg');
                    const rect = imgsvg.getBoundingClientRect();
                    const viewBox = imgsvg.getAttribute('viewBox');
                    let svgWidthLocal = imgsvg.getAttribute('width');
                    if (!svgWidthLocal && viewBox) svgWidthLocal = viewBox.split(' ')[2];
                    svgWidthLocal = Number(svgWidthLocal);
                    const zoomLocal = svgWidthLocal / imgsvg.clientWidth;
                    let clientX = ev.clientX || (ev.touches && ev.touches[0] && ev.touches[0].clientX) || 0;
                    let clientY = ev.clientY || (ev.touches && ev.touches[0] && ev.touches[0].clientY) || 0;
                    const sx = (clientX - rect.left) * zoomLocal;
                    const sy = (clientY - rect.top) * zoomLocal;
                    // distance to neighboring endpoints
                    const d1 = Math.hypot(sx - prevX, sy - prevY);
                    const d2 = Math.hypot(sx - c.x, sy - c.y);
                    const endpointRadiusSvgLocal = (desiredHandlePixelRadius-3) * zoomLocal;
                    const threshold = endpointRadiusSvgLocal * 1.2;
                    if (d1 <= threshold || d2 <= threshold) {
                        // let endpoint handler handle it
                        return;
                    }
                    ensureSelected(el);
                    const res = convertSegmentToQuadratic(el, idx, midX, midY);
                    if (res) {
                        // redraw selection overlays
                        redrawCursors();
                        beginDragNode({el, x: res.cx, y: res.cy, cmdIndex: res.cmdIndex, type: 'control'});
                    }
                };
                bc.addEventListener('mousedown', onBendPointer);
                bc.addEventListener('touchstart', onBendPointer, {passive: false});
                bc.addEventListener('pointerdown', (ev) => {
                    try { ev.preventDefault(); } catch (err) { /* ignore */ }
                    ev.stopPropagation();
                    if (ev.pointerId && ev.target && ev.target.setPointerCapture) {
                        try { ev.target.setPointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
                    }
                    onBendPointer(ev);
                });
                bc.setAttribute('cx', midX);
                bc.setAttribute('cy', midY);
            }
            bh.appendChild(bc);
            bendHandles.push(bh);
        }

        if (c.cmd === 'Q') {
            // prepare control handle
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('data-q-index', idx);
            g.setAttribute('class', 'q-control-handle');
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('stroke', 'rgba(255,0,0,0.9)');
            line.setAttribute('stroke-width', String(desiredLinePx * zoom));
            line.setAttribute('pointer-events', 'none');
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('r', String(desiredHandlePixelRadius * zoom));
            circle.setAttribute('fill', 'yellow');
            circle.setAttribute('stroke', 'black');
            circle.setAttribute('stroke-width', String(2 * zoom));
            // control handles are interactive when rendering selection handles
            if (options.forSelection) {
                circle.setAttribute('pointer-events', 'all');
                circle.style.cursor = 'move';
                circle.addEventListener('mousedown', (ev) => {
                    ev.stopPropagation();
                    ensureSelected(el);
                    beginDragNode({el, x: c.cx, y: c.cy, cmdIndex: idx, type: 'control'});
                });
                const onControlPointer = (ev) => {
                    try { ev.preventDefault(); } catch (err) { /* ignore */ }
                    ev.stopPropagation();
                    if (ev.pointerId && ev.target && ev.target.setPointerCapture) {
                        try { ev.target.setPointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
                    }
                    ensureSelected(el);
                    beginDragNode({el, x: c.cx, y: c.cy, cmdIndex: idx, type: 'control'});
                };
                circle.addEventListener('touchstart', onControlPointer, {passive: false});
                circle.addEventListener('pointerdown', onControlPointer);
            } else {
                circle.setAttribute('pointer-events', 'none');
            }
            line.setAttribute('x1', c.cx);
            line.setAttribute('y1', c.cy);
            line.setAttribute('x2', c.x);
            line.setAttribute('y2', c.y);
            circle.setAttribute('cx', c.cx);
            circle.setAttribute('cy', c.cy);
            g.appendChild(line);
            g.appendChild(circle);
            controlHandles.push(g);
        }

        // update prev for next iteration
        if (c.cmd === 'M' || c.cmd === 'L' || c.cmd === 'Q') {
            prevX = c.x; prevY = c.y;
        }
    });

    // if path is closed (Z), also create a closing bend handle and insert into bendHandles
    const zIdx = cmds.findIndex(cc => cc.cmd === 'Z');
    if (options.forSelection && zIdx !== -1) {
        // find last endpoint before Z
        let last = null; let lastIdx = -1;
        for (let k = cmds.length - 1; k >= 0; k--) {
            if (cmds[k].cmd === 'M' || cmds[k].cmd === 'L' || cmds[k].cmd === 'Q') { last = cmds[k]; lastIdx = k; break; }
        }
        const first = cmds.find(cc => cc.cmd === 'M');
        if (last && first) {
            const midX = (last.x + first.x) / 2;
            const midY = (last.y + first.y) / 2;
            const bh = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            bh.setAttribute('class', 'bend-handle');
            const bc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            bc.setAttribute('r', String((desiredHandlePixelRadius-4) * zoom));
            bc.setAttribute('fill', 'rgba(0,128,255,0.9)');
            bc.setAttribute('stroke', 'black');
            bc.setAttribute('stroke-width', String(1 * zoom));
            // decide visibility/offset if too close to endpoints
            const endpointRadiusSvg = (desiredHandlePixelRadius-3) * zoom;
            const distToPrev = Math.hypot(midX - last.x, midY - last.y);
            const distToFirst = Math.hypot(midX - first.x, midY - first.y);
            const minDist = Math.min(distToPrev, distToFirst);
            if (minDist <= endpointRadiusSvg * 1.2) {
                // offset outward
                const dx = first.x - last.x; const dy = first.y - last.y;
                const segLen = Math.hypot(dx, dy) || 1;
                const nx = -dy / segLen; const ny = dx / segLen;
                const offsetPx = 8; const offsetSvg = offsetPx * zoom;
                const ox = nx * offsetSvg; const oy = ny * offsetSvg;
                bc.setAttribute('pointer-events', 'all');
                bc.style.cursor = 'pointer';
                bc.setAttribute('cx', midX + ox);
                bc.setAttribute('cy', midY + oy);
            } else {
                bc.setAttribute('pointer-events', 'all');
                bc.style.cursor = 'pointer';
                bc.setAttribute('cx', midX);
                bc.setAttribute('cy', midY);
            }
            // attach handler (use zIdx as segIndex so convert handles insertion before Z)
            const onZBendPointer = (ev) => {
                try { ev.preventDefault(); } catch (err) { /* ignore */ }
                ev.stopPropagation();
                ensureSelected(el);
                const res = convertSegmentToQuadratic(el, zIdx, midX, midY);
                if (res) {
                    redrawCursors();
                    beginDragNode({el, x: res.cx, y: res.cy, cmdIndex: res.cmdIndex, type: 'control'});
                }
            };
            bc.addEventListener('mousedown', (ev) => { ev.stopPropagation(); onZBendPointer(ev); });
            bc.addEventListener('touchstart', onZBendPointer, {passive: false});
            bc.addEventListener('pointerdown', (ev) => { try { ev.preventDefault(); } catch (err) {} ev.stopPropagation(); if (ev.pointerId && ev.target && ev.target.setPointerCapture) { try { ev.target.setPointerCapture(ev.pointerId); } catch (err) {} } onZBendPointer(ev); });
            bh.appendChild(bc);
            bendHandles.push(bh);
        }
    }

    // append in order: control handles, bend handles, then endpoints so endpoints render on top
    const allHandles = [];
    controlHandles.forEach(h => { svgcursors.appendChild(h); allHandles.push(h); });
    bendHandles.forEach(h => { svgcursors.appendChild(h); allHandles.push(h); });
    endpointHandles.forEach(h => { svgcursors.appendChild(h); allHandles.push(h); });
    return allHandles;
}

export function renderAllHandles() {
    // Global handles disabled: only render handles for selected elements.
    return;
}

export function createSelectionHandlesForElement(el) {
    // create handles with interactive endpoints for selected element
    return createHandlesForElement(el, {interactiveEndpoints: true, forSelection: true});
}
export function deselectAllElements() {
    while (selectedElements.length > 0) {
        selectedElements.pop();
        selectedCursors.pop().remove();
        const handles = selectedControlHandles.pop();
        if (handles) {
            handles.forEach(h => h.remove());
        }
    }
    toggleToEl('svgtools');
}

export function selectElement(el) {
    let svgcursors = document.getElementById('svgcursors').querySelector('svg');
    if (el.closest('#svgimg') && el.tagName !== 'svg') {
        if (selectedElements.includes(el)) {
            let i = selectedElements.indexOf(el);
            selectedElements.splice(i, 1);
            selectedCursors[i].remove();
            selectedCursors.splice(i, 1);
            const handles = selectedControlHandles[i];
            if (handles) {
                handles.forEach(h => h.remove());
            }
            selectedControlHandles.splice(i, 1);
        } else {
            selectedElements.push(el);
            let cursor = el.cloneNode(true);
            svgcursors.appendChild(cursor);
            selectedCursors.push(cursor);

            // create selection handles (interactive endpoints)
            const handles = createSelectionHandlesForElement(el);
            selectedControlHandles.push(handles);
        }
        if (selectedElements.length === 1) {
            let sel = selectedElements[0];
            let fill = sel.getAttribute('fill');
            let stroke = sel.getAttribute('stroke');
            let width = sel.getAttribute('stroke-width');
            if (fill) {
                document.getElementById('fillcolor').value = fill;
            }
            if (stroke) {
                document.getElementById('strokecolor').value = stroke;
            }
            if (width) {
                document.getElementById('strokewidth').value = width;
            }
        }
    } else {
        deselectAllElements();
    }
    toggleToEl(selectedElements.length > 0 ? 'pathtools' : 'svgtools');
}

export function redrawCursors() {
    selectedCursors.forEach((cursor, i) => {
        let el = selectedElements[i];
        cursor.setAttribute('d', el.getAttribute('d'));
        // update control handles for this element
        const handles = selectedControlHandles[i];
        if (handles) {
            handles.forEach(h => h.remove());
        }
        const newHandles = createSelectionHandlesForElement(el);
        selectedControlHandles[i] = newHandles;
    });
}


// window-exposed actions
export function removeElements(getAutoSave) {
    selectedElements.forEach(el => {
        el.remove();
    });
    deselectAllElements();
    if (getAutoSave) getAutoSave()();
}

export function raiseElements(getAutoSave) {
    let allElements = Array.from(document.getElementById('svgimg').querySelector('svg').children);
    let highestSibling = allElements[0];
    let moveUp = [...selectedElements];
    moveUp.sort((a, b) => {
        return allElements.indexOf(a) - allElements.indexOf(b);
    });
    highestSibling = allElements.reduce((acc, el) => {
        if (moveUp.includes(el)) {
            if (el.nextElementSibling && !moveUp.includes(el.nextElementSibling)) {
                return el.nextElementSibling;
            } else {
                return el;
            }
        } else {
            return acc;
        }
    }, highestSibling);
    if (!moveUp.includes(highestSibling)) {
        moveUp.reverse().forEach(el => {
            highestSibling.after(el);
        });
    }
    if (getAutoSave) getAutoSave()();
}

export function lowerElements(getAutoSave) {
    let allElements = Array.from(document.getElementById('svgimg').querySelector('svg').children);
    let lowestSibling = allElements[allElements.length - 1];
    let moveDown = [...selectedElements];
    moveDown.sort((a, b) => {
        return allElements.indexOf(b) - allElements.indexOf(a);
    });
    lowestSibling = allElements.reverse().reduce((acc, el) => {
        if (moveDown.includes(el)) {
            if (el.previousElementSibling && !moveDown.includes(el.previousElementSibling)) {
                return el.previousElementSibling;
            } else {
                return el;
            }
        } else {
            return acc;
        }
    }, lowestSibling);
    if (!moveDown.includes(lowestSibling)) {
        moveDown.reverse().forEach(el => {
            lowestSibling.before(el);
        });
    }
    if (getAutoSave) getAutoSave()();
}

export function fillElements(getAutoSave) {
    selectedElements.forEach(el => {
        el.setAttribute('fill', document.getElementById('fillcolor').value);
    });
    if (getAutoSave) getAutoSave()();
}

export function strokeElements(getAutoSave) {
    let stroke = document.getElementById('strokecolor').value;
    let width = document.getElementById('strokewidth').value;
    if (Number(width) && Number(width) > 0) {
        selectedElements.forEach(el => {
            el.setAttribute('stroke', stroke);
            el.setAttribute('stroke-width', width);
        });
    } else {
        selectedElements.forEach(el => {
            el.removeAttribute('stroke');
            el.removeAttribute('stroke-width');
        });
    }
    if (getAutoSave) getAutoSave()();
}
