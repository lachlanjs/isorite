---
type: Concept
title: Softening
description: A small length added to every distance, so that close passes do not blow up.
---

When two bodies pass very close, $1/r^2$ is huge and the step that was fine a moment ago is far too long: energy jumps. Softening replaces the distance by $\sqrt{r^2 + \varepsilon^2}$:

$$
\mathbf{a}_i = G \sum_{j \ne i} m_j \frac{\mathbf{r}_j - \mathbf{r}_i}{(|\mathbf{r}_j - \mathbf{r}_i|^2 + \varepsilon^2)^{3/2}}
$$

Beyond a few $\varepsilon$ the force is Newton's; inside, it falls smoothly to zero. Each body acts like a small fuzzy ball rather than a point.

That is right for a galaxy, whose stars are a sampling of a smooth distribution: close encounters between them are noise, not physics. It is wrong for a planetary system.
