---
type: Problem
title: "Angles of a geodesic triangle"
uses: [global/gauss-bonnet, curvature/geodesic-curvature]
---

A triangle $T$ on a surface has geodesic edges and interior angles $\varphi_1$, $\varphi_2$, $\varphi_3$. Show that $\varphi_1 + \varphi_2 + \varphi_3 = \pi + \iint_T K\,dA$.

## Solution

The edges are geodesics, so $k_g = 0$ along each and $\int_{\partial T} k_g\,ds = 0$.

Gauss–Bonnet with $\chi(T) = 1$ gives $\iint_T K\,dA + \sum\theta_i = 2\pi$.

The exterior angles are $\theta_i = \pi - \varphi_i$, so $\sum\theta_i = 3\pi - \sum\varphi_i$.

So $\sum\varphi_i = \pi + \iint_T K\,dA$.
