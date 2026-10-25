---
type: Concept
title: The first fundamental form
description: "I = E du² + 2F du dv + G dv²: lengths and angles, measured without leaving the surface."
---

For a chart $\mathbf{x}(u, v)$ of a [regular surface](/surfaces/regular-surfaces.md "requires"), the inner product of $\mathbb{R}^3$ restricted to each tangent plane is

$$I = E\,du^2 + 2F\,du\,dv + G\,dv^2, \qquad E = \mathbf{x}_u \cdot \mathbf{x}_u,\; F = \mathbf{x}_u \cdot \mathbf{x}_v,\; G = \mathbf{x}_v \cdot \mathbf{x}_v.$$

It gives the length of a curve $(u(t), v(t))$ as $\int \sqrt{E\dot u^2 + 2F\dot u\dot v + G\dot v^2}\,dt$, the angle between two curves, and the area element $dA = \sqrt{EG - F^2}\,du\,dv$.

All of these are measured without leaving the surface: a creature living on it could compute $E$, $F$ and $G$.
