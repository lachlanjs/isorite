---
type: Concept
title: Geodesic curvature
description: How much a curve turns within the surface; k_g = 0 along a geodesic.
---

A curve $\alpha(s)$ on an oriented surface, by arc length, has acceleration $\alpha''$. Its component along the surface, in the tangent plane, is the **geodesic curvature** $k_g$: how much the curve turns within the surface, as seen from the surface.

$k_g = 0$ along a **geodesic**, a curve that goes as straight as the surface allows: great circles on a sphere, straight lines on a plane. The sign of $k_g$ depends on the orientation, which is why [orientability](/surfaces/orientable.md "see also") matters when it is integrated.

Code: [geodesics.jl](code:geodesics.jl#L12).
