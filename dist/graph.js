import { hash } from './importers.js';
import { typeLabels } from './analysis.js';

const namespace = 'http://www.w3.org/2000/svg';
const fixed = new Map([
  ['topic-science', [217, 145]],
  ['topic-finance', [629, 133]],
  ['topic-career', [702, 347]],
  ['topic-writing', [191, 346]],
  ['topic-reflection', [450, 261]],
  ['topic-engineering', [468, 111]],
]);

function svg(tag, attributes = {}, value) {
  const item = document.createElementNS(namespace, tag);
  for (const [name, data] of Object.entries(attributes))
    item.setAttribute(name, data);
  if (value) item.textContent = value;
  return item;
}

function seed(name) {
  let value = 0;
  for (const character of hash(name))
    value = (Math.imul(value, 31) + character.charCodeAt(0)) >>> 0;
  return value / 4294967296;
}

function star(radius, className) {
  const inset = radius * 0.23;
  return svg('path', {
    d: [
      'M',
      0,
      -radius,
      'L',
      inset,
      -inset,
      radius,
      0,
      inset,
      inset,
      0,
      radius,
      -inset,
      inset,
      -radius,
      0,
      -inset,
      -inset,
      'Z',
    ].join(' '),
    class: className,
  });
}

function position(nodes, edges, themes) {
  const points = new Map();
  const palette = new Map(themes.map((topic) => [topic.id, topic.color]));
  const listed = nodes.filter((node) => node.type === 'topic');
  const curated =
    listed.length >= 4 &&
    listed.length <= 6 &&
    listed.every((node) => fixed.has(node.id));
  const loc = new Map(
    listed.map((node, index) => {
      const angle = (-0.6 + (index / listed.length) * 2) * Math.PI;
      const x = listed.length === 1 ? 450 : 450 + Math.cos(angle) * 250;
      const y = listed.length === 1 ? 250 : 249 + Math.sin(angle) * 130;
      const spot = curated ? fixed.get(node.id) : [x, y];
      return [node.id, spot];
    }),
  );
  const buckets = new Map();
  for (const node of nodes) {
    if (node.type === 'topic') continue;
    const membership = node.topics.filter((id) => loc.has(id));
    const group = membership[0] ?? '';
    const bucket = buckets.get(group) ?? [];
    bucket.push(node);
    buckets.set(group, bucket);
  }
  for (const node of listed) {
    const [x, y] = loc.get(node.id);
    points.set(node.id, { x, y, ax: x, ay: y, fixed: true, color: node.color });
  }
  for (const [id, bucket] of buckets) {
    const [originX, originY] = loc.get(id) ?? [450, 250];
    bucket.forEach((node, index) => {
      const ring = index % 2;
      const angle = index * 2.39996 + seed(id) * 7;
      const distance = id
        ? (ring ? 76 : 53) + (node.type === 'memory' ? 17 : 0)
        : 65 + (index % 5) * 23;
      let x = originX + Math.cos(angle) * distance * 1.37;
      let y = originY + Math.sin(angle) * distance * 0.89;
      if (node.topics.length > 1 && loc.has(node.topics[1])) {
        const [otherX, otherY] = loc.get(node.topics[1]);
        x = x * 0.73 + otherX * 0.27;
        y = y * 0.73 + otherY * 0.27;
      }
      points.set(node.id, {
        x,
        y,
        ax: x,
        ay: y,
        color: palette.get(id) ?? '#77795d',
      });
    });
  }
  const arranged = [...points.values()];
  const bounded = (value, min, max) => Math.min(max, Math.max(min, value));
  // Keep anchor points still while resolving local collisions among satellites.
  for (let round = 0; round < 32; round++) {
    arranged.forEach((first, index) => {
      for (let j = index + 1; j < arranged.length; j++) {
        const second = arranged[j];
        const x = first.x - second.x,
          y = first.y - second.y;
        const distance = Math.hypot(x, y) || 1;
        const limit = first.fixed || second.fixed ? 43 : 30;
        if (distance >= limit) continue;
        const force = ((limit - distance) * 0.24) / distance;
        if (!first.fixed) {
          first.x += x * force;
          first.y += y * force;
        }
        if (!second.fixed) {
          second.x -= x * force;
          second.y -= y * force;
        }
      }
    });
    for (const edge of edges) {
      if (edge.type !== 'related_to' && edge.type !== 'leads_to') continue;
      const a = points.get(edge.from),
        b = points.get(edge.to);
      if (!a || !b || Math.hypot(a.x - b.x, a.y - b.y) > 190) continue;
      const dx = (b.x - a.x) * 0.005,
        dy = (b.y - a.y) * 0.005;
      if (!a.fixed) {
        a.x += dx;
        a.y += dy;
      }
      if (!b.fixed) {
        b.x -= dx;
        b.y -= dy;
      }
    }
    for (const point of arranged)
      if (!point.fixed) {
        point.x = bounded(point.x + (point.ax - point.x) * 0.055, 40, 850);
        point.y = bounded(point.y + (point.ay - point.y) * 0.055, 49, 455);
      }
  }
  return points;
}

function instrument() {
  const group = svg('g', { 'aria-hidden': 'true' });
  const contours = svg('g', { class: 'instrument' });
  contours.append(
    svg('ellipse', {
      cx: 449,
      cy: 252,
      rx: 393,
      ry: 181,
      transform: 'rotate(-11 449 252)',
    }),
    svg('ellipse', {
      cx: 449,
      cy: 252,
      rx: 356,
      ry: 157,
      transform: 'rotate(-11 449 252)',
      'stroke-dasharray': '2 6',
    }),
    svg('ellipse', {
      cx: 450,
      cy: 251,
      rx: 295,
      ry: 115,
      transform: 'rotate(15 450 251)',
      'stroke-dasharray': '2 6',
    }),
    svg('path', { d: 'M67 254H833M450 38V474', 'stroke-dasharray': '1 7' }),
    svg('circle', { cx: 450, cy: 254, r: 176, 'stroke-dasharray': '1 5' }),
    svg('circle', { cx: 450, cy: 254, r: 111, 'stroke-dasharray': '2 6' }),
    svg('path', {
      d: 'M44 61V38h23m766 0h23v23M44 453v23h23m766 0h23v-23',
    }),
  );
  for (let step = 0; step < 48; step++) {
    const angle = (step * Math.PI) / 24;
    const inner = step % 6 === 0 ? 164 : 171;
    const x = Math.cos(angle),
      y = Math.sin(angle);
    contours.append(
      svg('line', {
        x1: 450 + inner * x,
        y1: 254 + inner * y,
        x2: 450 + 176 * x,
        y2: 254 + 176 * y,
      }),
    );
  }
  const compass = svg('g', {
    transform: 'translate(795 92)',
    class: 'chart-compass',
  });
  compass.append(
    svg('circle', { r: 22 }),
    svg('circle', { r: 17 }),
    star(25, 'compass-star'),
  );
  contours.append(compass);
  group.append(contours);
  for (let index = 0; index < 67; index++) {
    const x = 63 + 780 * seed('x-' + index),
      y = 54 + 400 * seed('y-' + index);
    if (index % 14 === 0) {
      const spark = star(4, 'chart-spark');
      spark.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
      group.append(spark);
      continue;
    }
    group.append(
      svg('circle', {
        class: 'particle',
        cx: x,
        cy: y,
        r: index % 8 === 0 ? 1.45 : 0.7,
      }),
    );
  }
  return group;
}

export class AtlasGraph {
  constructor(element, tooltip, onSelect) {
    this.element = element;
    this.tooltip = tooltip;
    this.onSelect = onSelect;
    this.zoom = 1;
    this.x = 0;
    this.y = 0;
    this.nodeElements = new Map();
    this.edgeElements = [];
    this.run = 0;
    element.addEventListener(
      'wheel',
      (event) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        this.moveZoom(event.deltaY < 0 ? 'plus' : 'minus');
      },
      { passive: false },
    );
    element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('.node')) return;
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      element.setPointerCapture(event.pointerId);
      element.classList.add('panning');
    });
    element.addEventListener('pointermove', (event) => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      const scale = element.getScreenCTM()?.a || 1;
      this.x += (event.clientX - this.drag.x) / scale;
      this.y += (event.clientY - this.drag.y) / scale;
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      this.transform();
    });
    function finish(event) {
      if (event.pointerId !== this.drag?.id) return;
      this.drag = null;
      element.classList.remove('panning');
    }
    element.addEventListener('pointerup', finish.bind(this));
    element.addEventListener('pointercancel', finish.bind(this));
    element.addEventListener('lostpointercapture', finish.bind(this));
  }

  transform() {
    this.layer?.setAttribute(
      'transform',
      'translate(' +
        (this.x + 450) +
        ' ' +
        (this.y + 257) +
        ') scale(' +
        this.zoom +
        ') translate(-450 -257)',
    );
  }

  moveZoom(action) {
    if (action === 'reset') {
      this.zoom = 1;
      this.x = 0;
      this.y = 0;
    } else
      this.zoom = Math.max(
        0.68,
        Math.min(3.5, this.zoom * (action === 'plus' ? 1.22 : 1 / 1.22)),
      );
    this.transform();
  }

  render(nodes, edges, themes, selected, reset) {
    this.cancelGrowth();
    this.tooltip.hidden = true;
    this.nodeElements.clear();
    this.edgeElements = [];
    this.selected = selected;
    if (reset) this.moveZoom('reset');
    const points = position(nodes, edges, themes);
    this.layer = svg('g');
    const background = instrument();
    this.element.replaceChildren(background, this.layer);
    this.transform();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const edge of edges) {
      const a = points.get(edge.from),
        b = points.get(edge.to);
      if (!a || !b) continue;
      if (edge.type === 'related_to' && Math.hypot(a.x - b.x, a.y - b.y) > 230)
        continue;
      const cross = edge.type === 'leads_to' || a.color !== b.color;
      const mx = (a.x + b.x) / 2,
        my = (a.y + b.y) / 2;
      const shape = svg('path', {
        class: 'edge' + (cross ? ' edge-cross' : ''),
        d:
          'M' +
          a.x +
          ' ' +
          a.y +
          ' Q ' +
          (mx + (a.y - b.y) * 0.07) +
          ' ' +
          (my + (b.x - a.x) * 0.11) +
          ' ' +
          b.x +
          ' ' +
          b.y,
        style: '--edge:' + a.color,
        'aria-hidden': 'true',
      });
      this.edgeElements.push({ shape, ...edge });
      this.layer.append(shape);
    }
    const labelBoxes = [];
    const compact = matchMedia('(max-width: 740px)').matches;
    const ordered = [...nodes].sort(
      (a, b) =>
        Number(b.type === 'topic') - Number(a.type === 'topic') ||
        b.weight - a.weight,
    );
    for (const node of ordered) {
      const point = points.get(node.id);
      const topic = node.type === 'topic';
      const memory = node.type === 'memory';
      const question = node.type === 'question' || node.type === 'loop';
      const radius = topic
        ? 12 + Math.min(5, node.refs.length)
        : memory
          ? 3.1
          : question
            ? 4.1
            : 5.1 + Math.min(3, node.weight * 0.5);
      const item = svg('g', {
        transform: 'translate(' + point.x + ' ' + point.y + ')',
        role: 'button',
        tabindex: '0',
        'aria-label': (typeLabels[node.type] ?? node.type) + ' · ' + node.label,
        class:
          'node' +
          (topic ? ' node-topic' : '') +
          (node.id === selected ? ' node-selected' : ''),
        style: '--node:' + point.color,
      });
      item.append(
        svg('circle', { r: Math.max(12, radius + 4), fill: 'transparent' }),
      );
      if (topic) {
        item.append(
          svg('circle', { r: radius + 13, class: 'node-halo' }),
          svg('circle', { r: radius + 6, class: 'node-ring node-ring-outer' }),
          svg('circle', { r: radius + 2, class: 'node-ring' }),
          star(radius, 'node-dot'),
        );
      } else if (question) {
        item.append(
          svg('rect', {
            x: -radius,
            y: -radius,
            width: radius * 2,
            height: radius * 2,
            rx: node.type === 'loop' ? 0 : 1.5,
            transform: 'rotate(45)',
            class: 'node-dot',
          }),
        );
      } else {
        const dot = svg('circle', {
          r: radius,
          class: memory ? 'node-ring' : 'node-dot',
        });
        item.append(dot);
      }
      if (topic || (!memory && !question && node.label.length <= 22)) {
        const label = node.label;
        const size = topic ? (compact ? 23 : 19) : 12;
        const width = [...label].reduce(
          (sum, ch) => sum + (/[^\u0000-\u00ff]/.test(ch) ? size : size * 0.57),
          0,
        );
        const directions =
          point.x > 642
            ? ['left', 'right', 'bottom', 'top']
            : ['right', 'left', 'bottom', 'top'];
        for (const direction of directions) {
          const dx =
            direction === 'right'
              ? radius + 7
              : direction === 'left'
                ? -radius - 7
                : 0;
          const dy =
            direction === 'bottom'
              ? radius + 15
              : direction === 'top'
                ? -radius - 7
                : size * 0.3;
          const anchor =
            direction === 'right'
              ? 'start'
              : direction === 'left'
                ? 'end'
                : 'middle';
          const left =
            point.x +
            dx -
            (anchor === 'end' ? width : anchor === 'middle' ? width / 2 : 0);
          const top = point.y + dy - size;
          if (left < 25 || left + width > 875 || top < 37 || top + size > 468)
            continue;
          if (
            labelBoxes.some(
              (box) =>
                left < box.x + box.width + 8 &&
                left + width + 8 > box.x &&
                top < box.y + box.height + 4 &&
                top + size + 4 > box.y,
            )
          )
            continue;
          const coversNode = [...points.values()].some(
            (other) =>
              other !== point &&
              other.x > left - 6 &&
              other.x < left + width + 6 &&
              other.y > top - 5 &&
              other.y < top + size + 5,
          );
          if (coversNode && !topic) continue;
          labelBoxes.push({ x: left, y: top, width, height: size });
          item.append(
            svg(
              'text',
              {
                x: dx,
                y: dy,
                'text-anchor': anchor,
                class: 'node-label ' + (topic ? 'label-topic' : 'label-minor'),
              },
              label,
            ),
          );
          break;
        }
      }
      const select = () => this.onSelect(node.id);
      item.addEventListener('click', select);
      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      });
      item.addEventListener('pointerenter', (event) => {
        const rect = this.element.getBoundingClientRect();
        const title = document.createElement('strong');
        const info = document.createElement('span');
        title.textContent = node.label;
        info.textContent =
          (typeLabels[node.type] ?? node.type) +
          ' · ' +
          node.refs.length +
          ' 段对话';
        this.tooltip.replaceChildren(title, info);
        this.tooltip.style.left =
          Math.max(
            8,
            Math.min(rect.width - 253, event.clientX - rect.left + 12),
          ) + 'px';
        this.tooltip.style.top =
          Math.max(
            8,
            Math.min(rect.height - 95, event.clientY - rect.top + 12),
          ) + 'px';
        this.tooltip.hidden = false;
        this.highlight(node.id);
      });
      item.addEventListener('pointerleave', () => {
        this.tooltip.hidden = true;
        this.highlight(null);
      });
      item.addEventListener('focus', () => this.highlight(node.id));
      item.addEventListener('blur', () => this.highlight(null));
      this.nodeElements.set(node.id, { item, node });
      this.layer.append(item);
    }
    this.highlight(null);
    return byId;
  }

  highlight(id) {
    const selected = this.nodeElements.get(this.selected)?.node;
    if (id == null && selected?.type === 'topic') id = selected.id;
    const nearby = new Set(id ? [id] : []);
    const source = this.nodeElements.get(id)?.node;
    for (const { shape, from, to } of this.edgeElements) {
      const current = from === id || to === id;
      if (current) {
        nearby.add(from);
        nearby.add(to);
      }
      shape.classList.toggle('edge-muted', Boolean(id && !current));
      shape.classList.toggle('edge-active', current);
    }
    for (const [key, { item, node }] of this.nodeElements) {
      item.classList.toggle(
        'node-muted',
        Boolean(
          id &&
            !nearby.has(key) &&
            !(source?.type === 'topic' && node.topics.includes(id)),
        ),
      );
      item.classList.toggle('node-selected', key === this.selected);
    }
  }

  cancelGrowth() {
    this.run++;
    for (const { item } of this.nodeElements.values())
      item.classList.remove('growing');
    for (const { shape } of this.edgeElements)
      shape.classList.remove('growing');
    if (this.onGrowthEnd) this.onGrowthEnd();
    this.onGrowthEnd = null;
  }

  grow(onEnd, onDate) {
    this.cancelGrowth();
    const run = this.run;
    this.onGrowthEnd = onEnd;
    const dates = [
      ...new Set(
        [...this.nodeElements.values()].map(({ node }) => node.date ?? ''),
      ),
    ].sort();
    if (
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      dates.length < 2
    ) {
      this.cancelGrowth();
      return;
    }
    for (const { item } of this.nodeElements.values())
      item.classList.add('growing');
    for (const { shape } of this.edgeElements) shape.classList.add('growing');
    let cursorBefore = -1;
    const progress = (now) => {
      if (run !== this.run) return;
      start ??= now;
      const cursor = Math.floor(
        (dates.length - 1) * Math.min(1, (now - start) / 3450),
      );
      if (cursor === cursorBefore) {
        requestAnimationFrame(progress);
        return;
      }
      cursorBefore = cursor;
      const date = dates[cursor];
      onDate?.(date);
      for (const { item, node } of this.nodeElements.values())
        item.classList.toggle('growing', (node.date ?? '') > date);
      for (const { shape, from, to } of this.edgeElements)
        shape.classList.toggle(
          'growing',
          this.nodeElements.get(from).item.classList.contains('growing') ||
            this.nodeElements.get(to).item.classList.contains('growing'),
        );
      if (cursor < dates.length - 1) requestAnimationFrame(progress);
      else this.cancelGrowth();
    };
    let start;
    requestAnimationFrame(progress);
  }
}
