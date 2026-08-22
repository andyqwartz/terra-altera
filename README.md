# TERRA ALTERA

> *Every flat map is a lie told honestly.
> This one changes the lie.*

An interactive atlas that unfolds a sphere into five different truths.
Drag it. Flip it. Watch the world unroll.

**Live:** [andyqwartz.github.io/terra-altera](https://andyqwartz.github.io/terra-altera/)

---

## I. The Gesture

The globe begins closed — an orthographic eye hovering over one hemisphere.
Pull the slider, and the sphere **unrolls**: the hidden face swings over the
horizon in a choreographed clip arc until the whole world lies flat before
you. No seam. No jump. A continuous deformation from *looking at* to
*reading*.

Five destinations. One motion.

---

## II. The Five Foldings

### 1 · Equal Earth — *the honest oval*

Šavrič, Patterson & Jenny, 2018

A polynomial pseudocylindrical: area is sacred, shape pays the price near
the poles. Africa swallows Greenland whole — because it does.

With $M = \tfrac{\sqrt{3}}{2}$ and $l = \arcsin(M \sin\varphi)$:

$$
\begin{aligned}
x &= \frac{\lambda \cos l}{M\left(A_1 + 3A_2\,l^2 + l^6\,(7A_3 + 9A_4\,l^2)\right)} \\[4pt]
y &= l\left(A_1 + A_2\,l^2 + l^6\,(A_3 + A_4\,l^2)\right)
\end{aligned}
$$

$$
A_1 = 1.340264,\quad A_2 = -0.081106,\quad A_3 = 0.000893,\quad A_4 = 0.003796
$$

Four constants hold the whole world honestly. The inverse is Newton's
method, twelve steps, no closed form.

*What it shows:* true size. *What it hides:* nothing but familiar shapes.

---

### 2 · Hobo-Dyer — *the flipped classic*

Mick Dyer, 2002

A cylindrical equal-area projection with standard parallel $\varphi_1 = 37.5°$.
Printed south-up from its first edition — the map that refuses to introduce
the world from above.

$$
x = \lambda\cos\varphi_1, \qquad y = \frac{\sin\varphi}{\cos\varphi_1}
$$

Equal-area by construction: every degree of latitude occupies the same band
of ink.

*What it shows:* the equator as the world's waistline, not its footnote.
*What it hides:* polar shapes, stretched like taffy.

---

### 3 · Gall-Peters — *the polemic rectangle*

James Gall, 1885 · Arno Peters, 1973

Same cylinder, steeper wall: standard parallel $\varphi_1 = 45°$. Peters
presented Gall's quiet projection as an instrument of development geography,
and cartography never forgave the noise — nor forgot the point.

$$
x = \lambda\cos 45°, \qquad y = \sqrt{2}\,\sin\varphi
$$

The vertical stretch relative to Mercator's equator-hugging compression is
$\sqrt{2}\cos\varphi$ — Africa stands tall here.

*What it shows:* the Global South at full height. *What it hides:* graceful
proportions.

---

### 4 · Equirectangular — *the raw grid*

Marinus of Tyre, c. 100 AD

No ideology, no correction: every degree is a square. The plate carrée —
the machine's native flat Earth, and the target this atlas unrolls into.

$$
x = \lambda, \qquad y = \varphi
$$

The simplest equation ever to hold the whole world. It preserves neither
area nor angle — only distance along the parallels — and declines to
apologize.

*What it shows:* coordinates as destiny. *What it hides:* everything else.

---

### 5 · AuthaGraph — *the foldable world*

Hajime Narukawa, 1999 · open approximation: J. Kunimune's IMAGO, 2017

Projected onto a tetrahedron, then unfolded into a shape that tiles the
plane infinitely — any point on Earth can sit at the center. Areas hold
within about one percent.

The mapping passes through Lee's tetrahedral machinery:

$$
(x, y) = f_{\text{Lee}}\!\big(\mathrm{rot}(\lambda, \varphi)\big),
\qquad
f_{\text{Lee}}: \text{sphere} \to \text{tetra} \to \mathbb{R}^2
$$

solved numerically, by Newton–Raphson iteration on the inverse. This build
uses Kunimune's IMAGO equations at $k = 0.68$ — the closest open form of
Narukawa's still-patented original.

*What it shows:* a world without a fixed top. *What it hides:* the original
equations — they were never published.

---

## III. The Unrolling

The transition is not a crossfade. It is a genuine geometric interpolation:
at every frame $t \in [0,1]$, the projected position is the linear blend of
two projection functions, refitted at each frame so the composition never
drifts,

$$
P_t(\lambda, \varphi) = (1-t)\,P_{\text{ortho}}(\lambda, \varphi) + t\,P_{\text{target}}(\lambda, \varphi)
$$

while a clipping arc opens from $90°$ to $180°$,

$$
\alpha(t) = 90° + 90°\,t
$$

so the far hemisphere swings into view exactly as fast as the sphere
flattens. South-up is a rigid half-turn: $\gamma = 180°$.

---

## IV. Operation

| Key | Effect |
|-----|--------|
| `Space` | play the unfolding |
| `←` `→` | scrub the morph |
| `S` | roll 180° — the south rises |
| `G` | graticule |
| `E` / `P` | export SVG / PNG |
| `T` | night ↔ paper |
| `F` | focus — the map alone |

Exports render the current view, in the current theme, under the current
truth.

---

## V. Sources

- d3-geo, d3-geo-projection, d3-geo-polygon (ISC)
- Natural Earth data (public domain), 110m
- Šavrič, Patterson, Jenny — *The Equal Earth map projection*, IJGIS 2018, DOI [10.1080/13658816.2018.1504949](https://doi.org/10.1080/13658816.2018.1504949)
- Kunimune — *The AuthaGraph revealed*, 2017 ([kunimune.blog](https://kunimune.blog))
- Narukawa — AuthaGraph Co., 1999 ([authagraph.com](https://authagraph.com))

---

*Cartography is an argument. Choose your sentence.*

<!-- TERRA ALTERA — SERENDIPPO -->
