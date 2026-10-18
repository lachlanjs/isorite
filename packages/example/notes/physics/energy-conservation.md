---
type: Concept
title: Energy and its conservation
description: Kinetic plus potential energy stays constant; how far it drifts measures the error.
---

For bodies under [gravity](/physics/newtons-law-of-gravitation.md "requires"):

$$
K = \tfrac12 \sum_i m_i |\mathbf{v}_i|^2, \qquad U = -G \sum_{i<j} \frac{m_i m_j}{|\mathbf{r}_i - \mathbf{r}_j|}
$$

$E = K + U$ is constant in the exact motion. Total momentum $\sum_i m_i \mathbf{v}_i$ is too.

A numerical integration does not keep $E$ exactly. The relative drift $|E(t) - E(0)|/|E(0)|$ is the cheapest check on a run that there is: no reference solution is needed.

Note the $i<j$: each pair once.
