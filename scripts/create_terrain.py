import math
from compas.datastructures import Mesh
import trimesh


vertices = []

size = 20
resolution = 50

for i in range(resolution):
    for j in range(resolution):

        x = i / resolution * size
        y = j / resolution * size

        z = (
            math.sin(x * 0.4) *
            math.cos(y * 0.4)
        )

        vertices.append([x, y, z])


faces = []

for i in range(resolution - 1):
    for j in range(resolution - 1):

        a = i * resolution + j
        b = a + 1
        c = a + resolution
        d = c + 1

        faces.append([a, b, d])
        faces.append([a, d, c])


mesh = Mesh.from_vertices_and_faces(
    vertices,
    faces
)


# Export using trimesh
tm = trimesh.Trimesh(
    vertices=vertices,
    faces=faces
)

tm.export("../rabbitWeb/terrain.glb")

print("Terrain exported")