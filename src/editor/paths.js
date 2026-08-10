// Utilities to parse/serialize simple absolute SVG path d strings (supports M, L, Q, Z)
export function parsePathD(d) {
    const cmds = [];
    if (!d) return cmds;
    const re = /([MLQZ])([^MLQZ]*)/ig;
    let m;
    while ((m = re.exec(d)) !== null) {
        const cmd = m[1].toUpperCase();
        const params = m[2].trim();
        if (cmd === 'Z') {
            cmds.push({cmd: 'Z'});
            continue;
        }
        if (!params) continue;
        const nums = params.split(/[^0-9+\-\.eE]+/).filter(s => s.length>0).map(Number);
        if (cmd === 'M' || cmd === 'L') {
            for (let i = 0; i < nums.length; i += 2) {
                cmds.push({cmd, x: nums[i], y: nums[i+1]});
            }
        } else if (cmd === 'Q') {
            // Q: cx cy x y (can be repeated)
            for (let i = 0; i < nums.length; i += 4) {
                cmds.push({cmd:'Q', cx: nums[i], cy: nums[i+1], x: nums[i+2], y: nums[i+3]});
            }
        }
    }
    return cmds;
}

export function serializePath(cmds) {
    if (!cmds || cmds.length === 0) return '';
    let out = '';
    cmds.forEach(c => {
        if (c.cmd === 'Z') {
            out += 'Z ';
        } else if (c.cmd === 'M' || c.cmd === 'L') {
            out += c.cmd + ' ' + c.x + ' ' + c.y + ' ';
        } else if (c.cmd === 'Q') {
            out += 'Q ' + c.cx + ' ' + c.cy + ' ' + c.x + ' ' + c.y + ' ';
        }
    });
    return out.trim();
}

function dist2(a,b){return (a.x-b.x)*(a.x-b.x)+(a.y-b.y)*(a.y-b.y);} 

export function findClosestNode(el, x, y) {
    const d = el.getAttribute('d');
    const cmds = parsePathD(d);
    let best = null;
    for (let i = 0; i < cmds.length; i++) {
        const c = cmds[i];
        if (c.cmd === 'M' || c.cmd === 'L') {
            const dx = c.x - x; const dy = c.y - y;
            const dist = Math.hypot(dx, dy);
            if (!best || dist < best.d) {
                best = {el, x: c.x, y: c.y, d: dist, cmdIndex: i, type: 'endpoint'};
            }
        } else if (c.cmd === 'Q') {
            // endpoint
            let dx = c.x - x; let dy = c.y - y; let dist = Math.hypot(dx,dy);
            if (!best || dist < best.d) {
                best = {el, x: c.x, y: c.y, d: dist, cmdIndex: i, type: 'endpoint'};
            }
            // control
            dx = c.cx - x; dy = c.cy - y; dist = Math.hypot(dx,dy);
            if (!best || dist < best.d) {
                best = {el, x: c.cx, y: c.cy, d: dist, cmdIndex: i, type: 'control'};
            }
        }
    }
    return best; // may be null
}

function pointToSegmentDistance(px,py, x1,y1, x2,y2) {
    const vx = x2 - x1; const vy = y2 - y1;
    const wx = px - x1; const wy = py - y1;
    const c1 = vx*wx + vy*wy;
    const c2 = vx*vx + vy*vy;
    if (c2 === 0) return Math.hypot(px-x1, py-y1);
    const t = Math.max(0, Math.min(1, c1 / c2));
    const projx = x1 + t*vx; const projy = y1 + t*vy;
    return {d: Math.hypot(px-projx, py-projy), t, projx, projy};
}

export function findClosestSegment(el, x, y, threshold=8) {
    const d = el.getAttribute('d');
    const cmds = parsePathD(d);
    // find consecutive endpoint pairs (M/L -> L) where we have a segment
    let prev = null; let best = null;
    let prevIndex = -1;
    let firstMIndex = -1;
    let zIndex = -1;
    for (let i = 0; i < cmds.length; i++) {
        const c = cmds[i];
        if (c.cmd === 'M') {
            if (firstMIndex === -1) firstMIndex = i;
        }
        if (c.cmd === 'Z') {
            zIndex = i;
        }
        if (c.cmd === 'M' || c.cmd === 'L') {
            if (prev) {
                const res = pointToSegmentDistance(x,y, prev.x, prev.y, c.x, c.y);
                if (res.d <= threshold) {
                    if (!best || res.d < best.d) {
                        best = {el, segIndex: i, fromIndex: prevIndex, toIndex: i, d: res.d, t: res.t, projx: res.projx, projy: res.projy};
                    }
                }
            }
            prev = c;
            prevIndex = i;
        } else if (c.cmd === 'Q') {
            // skip curved segments for conversion
            prev = {x: c.x, y: c.y};
            prevIndex = i;
        }
    }
    // check closing segment if path ends with Z and we have endpoints
    if (zIndex !== -1 && prev && firstMIndex !== -1) {
        const first = cmds[firstMIndex];
        const res = pointToSegmentDistance(x,y, prev.x, prev.y, first.x, first.y);
        if (res.d <= threshold) {
            if (!best || res.d < best.d) {
                // mark segIndex as the index of the Z command so conversion can insert before it
                best = {el, segIndex: zIndex, fromIndex: prevIndex, toIndex: firstMIndex, d: res.d, t: res.t, projx: res.projx, projy: res.projy, closing: true};
            }
        }
    }
    return best; // or null
}

export function convertSegmentToQuadratic(el, segIndex, controlX, controlY) {
    // segIndex is usually the index of the 'to' command (L) in cmds array.
    // For closing segments, segIndex may point at a Z command; handle that case by inserting before Z.
    const d = el.getAttribute('d');
    const cmds = parsePathD(d);
    const target = cmds[segIndex];
    if (!target) return null;
    // if target is Z, we need to create a Q before it with endpoint = first M coords
    if (target.cmd === 'Z') {
        // find first M
        let firstM = cmds.find(c => c.cmd === 'M');
        if (!firstM) return null;
        const newCmd = {cmd: 'Q', cx: controlX, cy: controlY, x: firstM.x, y: firstM.y};
        // insert before Z (at index segIndex)
        cmds.splice(segIndex, 0, newCmd);
        const newD = serializePath(cmds);
        el.setAttribute('d', newD);
        return {cmdIndex: segIndex, cx: controlX, cy: controlY, x: firstM.x, y: firstM.y};
    }
    if (target.cmd !== 'L' && target.cmd !== 'M') return null;
    // Replace the 'L' at segIndex with 'Q' using controlX,controlY and endpoint
    const newCmd = {cmd: 'Q', cx: controlX, cy: controlY, x: target.x, y: target.y};
    cmds[segIndex] = newCmd;
    const newD = serializePath(cmds);
    el.setAttribute('d', newD);
    return {cmdIndex: segIndex, cx: controlX, cy: controlY, x: target.x, y: target.y};
}

export function updateControlPoint(el, cmdIndex, cx, cy) {
    const d = el.getAttribute('d');
    const cmds = parsePathD(d);
    const c = cmds[cmdIndex];
    if (!c || c.cmd !== 'Q') return false;
    c.cx = cx; c.cy = cy;
    el.setAttribute('d', serializePath(cmds));
    return true;
}

export function updateEndpoint(el, cmdIndex, x, y) {
    const d = el.getAttribute('d');
    const cmds = parsePathD(d);
    const c = cmds[cmdIndex];
    if (!c) return false;

    // capture previous coords for potential delta propagation
    let oldX = c.x || 0;
    let oldY = c.y || 0;

    if (c.cmd === 'M' || c.cmd === 'L' || c.cmd === 'Q') {
        c.x = x; c.y = y;
    }

    // If path is closed (has Z) and the moved endpoint is either the first M or the last endpoint before Z,
    // keep them linked by applying the same delta to the corresponding partner point.
    const zIndex = cmds.findIndex(cmd => cmd.cmd === 'Z');
    const firstMIndex = cmds.findIndex(cmd => cmd.cmd === 'M');
    if (zIndex !== -1 && firstMIndex !== -1) {
        // find last endpoint before Z
        let lastIdx = -1;
        for (let k = zIndex - 1; k >= 0; k--) {
            if (cmds[k].cmd === 'M' || cmds[k].cmd === 'L' || cmds[k].cmd === 'Q') { lastIdx = k; break; }
        }
        const dx = x - oldX;
        const dy = y - oldY;
        if (cmdIndex === lastIdx && firstMIndex !== -1) {
            // moved the last endpoint: apply delta to first M as well
            const firstM = cmds[firstMIndex];
            if (firstM) {
                firstM.x = (firstM.x || 0) + dx;
                firstM.y = (firstM.y || 0) + dy;
            }
        } else if (cmdIndex === firstMIndex && lastIdx !== -1) {
            // moved the first M: apply delta to last endpoint
            const last = cmds[lastIdx];
            if (last) {
                last.x = (last.x || 0) + dx;
                last.y = (last.y || 0) + dy;
            }
        }
    }

    el.setAttribute('d', serializePath(cmds));
    return true;
}

export function finalizeQuadraticIfStraight(el, cmdIndex, tol = 1.0) {
    // If the command at cmdIndex is Q and its control point lies on the straight line between
    // previous point and endpoint (within tol), convert it back to an L segment.
    const d = el.getAttribute('d');
    const cmds = parsePathD(d);
    const c = cmds[cmdIndex];
    if (!c || c.cmd !== 'Q') return false;
    const prev = cmds[cmdIndex - 1];
    if (!prev || !(prev.cmd === 'M' || prev.cmd === 'L' || prev.cmd === 'Q')) return false;
    const startX = prev.x; const startY = prev.y;
    const endX = c.x; const endY = c.y;
    const cx = c.cx; const cy = c.cy;
    const cross = (cx - startX) * (endY - startY) - (cy - startY) * (endX - startX);
    const segLen = Math.hypot(endX - startX, endY - startY);
    const distToLine = segLen > 0 ? Math.abs(cross) / segLen : Math.hypot(cx - startX, cy - startY);
    if (distToLine <= tol) {
        cmds[cmdIndex] = {cmd: 'L', x: c.x, y: c.y};
        el.setAttribute('d', serializePath(cmds));
        return true;
    }
    return false;
}

export function normalizePathEndpoints(el, tol = 1.0) {
    // Remove consecutive or very-close endpoint commands to avoid clusters after dragging.
    const d = el.getAttribute('d');
    const cmds = parsePathD(d);
    if (!cmds || cmds.length === 0) return false;
    const out = [];
    let lastPt = null;
    let firstM = null;

    for (let i = 0; i < cmds.length; i++) {
        const c = cmds[i];
        if (c.cmd === 'M') {
            firstM = {x: c.x, y: c.y};
            // always keep first M
            out.push({cmd:'M', x:c.x, y:c.y});
            lastPt = {x: c.x, y: c.y};
        } else if (c.cmd === 'L') {
            const dx = c.x - lastPt.x; const dy = c.y - lastPt.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= tol) {
                // skip nearly-duplicate endpoint
                continue;
            }
            out.push({cmd:'L', x:c.x, y:c.y});
            lastPt = {x: c.x, y: c.y};
        } else if (c.cmd === 'Q') {
            const dx = c.x - lastPt.x; const dy = c.y - lastPt.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= tol) {
                // endpoint coincides with last point – drop this segment
                continue;
            }
            // keep Q as-is, but ensure control point isn't coincident; no further checks here
            out.push({cmd:'Q', cx: c.cx, cy: c.cy, x: c.x, y: c.y});
            lastPt = {x: c.x, y: c.y};
        } else if (c.cmd === 'Z') {
            // closing: if lastPt is very close to firstM, we can keep Z; otherwise keep as-is
            if (!firstM) {
                out.push({cmd:'Z'});
            } else {
                const dx = firstM.x - lastPt.x; const dy = firstM.y - lastPt.y;
                const dist = Math.hypot(dx, dy);
                if (dist <= tol) {
                    // nothing to add, keep Z to close
                    out.push({cmd:'Z'});
                } else {
                    // if there's a small stray point, add a final L to firstM then Z
                    out.push({cmd:'L', x: firstM.x, y: firstM.y});
                    out.push({cmd:'Z'});
                }
            }
        }
    }
    const newD = serializePath(out);
    el.setAttribute('d', newD);
    return true;
}
