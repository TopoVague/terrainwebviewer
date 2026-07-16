from compas.geometry import Box, Sphere, Cylinder
from compas_viewer import Viewer

viewer = Viewer()

box = Box(2, 1, 1)
sphere = Sphere(radius=0.5)
cylinder = Cylinder(radius=0.3, height=2)

viewer.scene.add(box)
viewer.scene.add(sphere)
viewer.scene.add(cylinder)

viewer.show()