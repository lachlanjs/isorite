def gaussian_curvature(E, F, G, e, f, g):
    """K = (eg - f^2) / (EG - F^2), from the two fundamental forms."""
    return (e * g - f * f) / (E * G - F * F)
