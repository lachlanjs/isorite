---
type: Concept
title: Gaussian curvature
description: K = κ₁κ₂ = (eg − f²)/(EG − F²)
---

At a point, the normal curvature takes a largest and a smallest value, the principal curvatures $\kappa_1$ and $\kappa_2$. Their product is the **Gaussian curvature**

$$K = \kappa_1 \kappa_2 = \frac{eg - f^2}{EG - F^2},$$

computed from the [second fundamental form](/surfaces/second-ff.md "requires") over the first.

Changing the sign of the normal changes both $\kappa_i$, so it leaves $K$ alone. $K > 0$ where the surface curves one way (a sphere), $K < 0$ where it is a saddle, and $K = 0$ on a cylinder, which can be unrolled flat.

Code: [the formula in curvature.py](code:curvature.py#L1-L6).
