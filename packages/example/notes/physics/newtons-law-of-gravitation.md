---
type: Concept
title: Newton's law of gravitation
description: Every pair of bodies pulls on each other along the line between them.
---

Body $j$ pulls body $i$ with

$$
\mathbf{F}_{ij} = G\, m_i m_j \frac{\mathbf{r}_j - \mathbf{r}_i}{|\mathbf{r}_j - \mathbf{r}_i|^3}
$$

The cube in the denominator is one power for the inverse square, and two to turn $\mathbf{r}_j - \mathbf{r}_i$ into a unit vector.

Newton's third law: $\mathbf{F}_{ji} = -\mathbf{F}_{ij}$. Each pair needs computing once, not twice.

The acceleration of $i$ is the sum over every other body, divided by $m_i$:

$$
\mathbf{a}_i = G \sum_{j \ne i} m_j \frac{\mathbf{r}_j - \mathbf{r}_i}{|\mathbf{r}_j - \mathbf{r}_i|^3}
$$
