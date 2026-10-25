---
type: Concept
title: Gauss–Bonnet theorem
description: Total curvature is 2πχ.
---

Let $M$ be a compact oriented surface whose boundary curves meet at corners with exterior angles $\theta_i$. Then

$$\iint_M K\,dA + \int_{\partial M} k_g\,ds + \sum_i \theta_i = 2\pi\chi(M).$$

Total curvature is topological: the [Gaussian curvature](/curvature/gaussian-curvature.md "requires") and the [geodesic curvature](/curvature/geodesic-curvature.md "requires") are local, and depend on the metric, yet their total, with the corner angles, is fixed by the [Euler characteristic](/global/euler.md "requires") alone.

## Proof sketch

Triangulate $M$ finely enough that every triangle $T_j$ lies in one chart, and apply the local Gauss–Bonnet formula to each: $\iint_{T_j} K\,dA + \int_{\partial T_j} k_g\,ds + \sum_i \theta_{ji} = 2\pi$. Add them over all $F$ triangles. The curvature integrals add up to $\iint_M K\,dA$. Along an interior edge the two triangles that share it run along it in opposite directions, so their $k_g$ terms cancel, and what is left is $\int_{\partial M} k_g\,ds$.

That leaves the corners. For a closed $M$, the exterior angles of one triangle sum to $3\pi$ less its interior angles, and the interior angles at a vertex sum to $2\pi$, so the corners contribute $3\pi F - 2\pi V$ in all. Then $\iint_M K\,dA = 2\pi F - (3\pi F - 2\pi V) = 2\pi V - \pi F$. Each triangle has three edges and each edge is shared by two, so $3F = 2E$, and $2\pi V - \pi F = 2\pi(V - E + F) = 2\pi\chi$.

## Why each hypothesis

**Oriented:** so that $k_g$ and the angles have one sign all the way round. See [the Möbius band](/surfaces/orientable.md "see also").

**Compact:**

[[!where-is-compactness-used]]

## Examples

A sphere of radius $r$ has $K = 1/r^2$ and area $4\pi r^2$, so $\iint K\,dA = 4\pi = 2\pi \cdot 2$, and $\chi = 2$.

A torus has $\chi = 0$, so its total curvature is zero: the positive curvature of the outer half is balanced by the negative curvature of the inner half.

Further reading: [Gauss–Bonnet theorem · Wikipedia](https://en.wikipedia.org/wiki/Gauss%E2%80%93Bonnet_theorem).
