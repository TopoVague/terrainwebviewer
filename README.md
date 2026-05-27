# Terrain Web Viewer 
A minimal web-based 3D viewer for loading a CSV file with `x,y,z` coordinates and one or more buildings using a json file

Built with:

- Vite
- React
- TypeScript
- Three.js
- React Three Fiber
- Drei

## Run it

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite. And load some geometry. You can find some in the sample-data folder

## Terrain CSV format

The app accepts files like:

```csv
x,y,z
0,0,0
1,0,0.4
2,0,0.7
```
Header row is optional. If there is no header, the first three columns are treated as `x`, `y`, and `z`.



## Buildings .json format

The app accepts files that are structured as follows, "Building ID",unique identifier for the building "floors":a collection of footprints, the height , the type of level (i.e. uniform, split) and the color   "footprint": x,y ,z coordinates of the building outline 
"Building ID" = unique identifier for the building 
"floors" = a collection of footprints, the height , the type of level (i.e. uniform, split) and the color  
"footprint" =  x,y ,z coordinates of the building outline 

[
  {   "Building ID":  [  {  "ID": 1  }  ],
    "floors": [  {
        "footprint": [
          {
            "x": 8.830477045383304, "y": 13.451614634599537
          },
          {
            "x": 25.07556499913335, "y": 1.1156703508459032
          },
          {
            "x": 33.54223918169737, "y": 12.265353229129687
          },
          {
            "x": 17.297151227947325, "y": 24.60129751288332
          }
        ],
        "z": 2.9346918295624738,
        "height": 2.7
      },"footprint": […]
] 
"floorHeight": 2.815,
    "splitLevel": false,
    "color": "#10b981"
  }]



## Notes

The idea is that we could automatically pull the .csv of the terrain and the .json of the building directly from a folder by providing a link to a project
When moving or roating we save the modifications into a .json file
