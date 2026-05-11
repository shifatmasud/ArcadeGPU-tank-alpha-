import { gfx3JoltManager, JOLT_LAYER_NON_MOVING, Gfx3Jolt, JOLT_LAYER_MOVING } from '@lib/gfx3_jolt/gfx3_jolt_manager';
import { Gfx3Mesh } from '@lib/gfx3_mesh/gfx3_mesh';
import { gfx3MeshRenderer } from '@lib/gfx3_mesh/gfx3_mesh_renderer';
import { UT } from '@lib/core/utils';
import { Quaternion } from '@lib/core/quaternion';
import { createBoxMesh, createTerrainMesh, generateHeightmapCanvas } from './GameUtils';

export class Environment {
  floor: Gfx3Mesh;
  static meshesInitialized = false;
  static qMat = new Quaternion();
  
  static wallBaseN: Gfx3Mesh;
  static wallBaseS: Gfx3Mesh;
  static wallBaseE: Gfx3Mesh;
  static wallBaseW: Gfx3Mesh;
  
  static treeTrunk: Gfx3Mesh;
  static treeLeaves: Gfx3Mesh;
  static building: Gfx3Mesh;
  static sandWall: Gfx3Mesh;
  static crateMesh: Gfx3Mesh;
  static cloudMesh: Gfx3Mesh;
  
  decorations: { type: string, pos: vec3, scale: vec3 }[] = [];
  clouds: { pos: vec3, scale: vec3, nextX: number }[] = [];
  crates: { body: any }[] = [];

  constructor() {
    if (!Environment.meshesInitialized) {
      Environment.wallBaseN = createBoxMesh(400, 40, 20, [0.3, 0.4, 0.3]);
      Environment.wallBaseS = createBoxMesh(400, 40, 20, [0.3, 0.4, 0.3]);
      Environment.wallBaseE = createBoxMesh(20, 40, 400, [0.3, 0.4, 0.3]);
      Environment.wallBaseW = createBoxMesh(20, 40, 400, [0.3, 0.4, 0.3]);
      
      Environment.treeTrunk = createBoxMesh(1, 1, 1, [0.4, 0.25, 0.1]); // 1x1x1 scaled
      Environment.treeLeaves = createBoxMesh(1, 1, 1, [0.2, 0.6, 0.1]); 
      Environment.building = createBoxMesh(1, 1, 1, [0.55, 0.55, 0.6]); 
      Environment.sandWall = createBoxMesh(1, 1, 1, [0.6, 0.55, 0.45]);
      Environment.crateMesh = createBoxMesh(2, 2, 2, [0.6, 0.4, 0.2]); // Fix size to map physics
      Environment.cloudMesh = createBoxMesh(1, 1, 1, [0.9, 0.9, 0.95]); 
      
      Environment.meshesInitialized = true;
    }

    const canvas = generateHeightmapCanvas(256, 256);
    const terrainData = createTerrainMesh(400, 400, 32, 32, [0.25, 0.45, 0.2], canvas);
    this.floor = terrainData.mesh;
    
    // Add a simple box collider as a test
    gfx3JoltManager.addBox({
        width: 400, height: 1, depth: 400,
        x: 0, y: -2, z: 0,
        motionType: Gfx3Jolt.EMotionType_Static,
        layer: JOLT_LAYER_NON_MOVING
    });

    gfx3JoltManager.addPolygonShape({
        vertices: terrainData.vertices,
        indexes: terrainData.indexes,
        x: 0, y: 0, z: 0,
        motionType: Gfx3Jolt.EMotionType_Static,
        layer: JOLT_LAYER_NON_MOVING
    });

    // Generate mountains/walls at the edges
    const mapSize = 400;
    const borderThickness = 20;
    const borderHeight = 40;
    
    // North wall
    this.decorations.push({ type: 'wallN', pos: [0, borderHeight / 2 - 1, -mapSize / 2], scale: [1,1,1]});
    gfx3JoltManager.addBox({
        width: mapSize, height: borderHeight, depth: borderThickness,
        x: 0, y: borderHeight / 2 - 1, z: -mapSize / 2,
        motionType: Gfx3Jolt.EMotionType_Static,
        layer: JOLT_LAYER_NON_MOVING
    });

    // South wall
    this.decorations.push({ type: 'wallS', pos: [0, borderHeight / 2 - 1, mapSize / 2], scale: [1,1,1]});
    gfx3JoltManager.addBox({
        width: mapSize, height: borderHeight, depth: borderThickness,
        x: 0, y: borderHeight / 2 - 1, z: mapSize / 2,
        motionType: Gfx3Jolt.EMotionType_Static,
        layer: JOLT_LAYER_NON_MOVING
    });

    // East wall
    this.decorations.push({ type: 'wallE', pos: [mapSize / 2, borderHeight / 2 - 1, 0], scale: [1,1,1]});
    gfx3JoltManager.addBox({
        width: borderThickness, height: borderHeight, depth: mapSize,
        x: mapSize / 2, y: borderHeight / 2 - 1, z: 0,
        motionType: Gfx3Jolt.EMotionType_Static,
        layer: JOLT_LAYER_NON_MOVING
    });

    // West wall
    this.decorations.push({ type: 'wallW', pos: [-mapSize / 2, borderHeight / 2 - 1, 0], scale: [1,1,1]});
    gfx3JoltManager.addBox({
        width: borderThickness, height: borderHeight, depth: mapSize,
        x: -mapSize / 2, y: borderHeight / 2 - 1, z: 0,
        motionType: Gfx3Jolt.EMotionType_Static,
        layer: JOLT_LAYER_NON_MOVING
    });

    // Generate cityscape / buildings / trees - REMOVED for clean testing
    
    this.initBatch();

    // Add physics crates (test objects)
    // Reduce total box object count to 5 for cleaner testing and improved performance clarity.
    // Maintain even spacing between remaining objects.
    for (let i = 0; i < 5; i++) {
        this.addCrate(-20 + i * 10, 5, 20); // 5 crates spaced evenly by 10 units
    }
    
    // Add clouds
    for (let i = 0; i < 20; i++) {
        const cx = (Math.random() - 0.5) * 400;
        const cy = 40 + Math.random() * 20;
        const cz = (Math.random() - 0.5) * 400;
        const cw = 15 + Math.random() * 20;
        const ch = 4 + Math.random() * 4;
        const cd = 10 + Math.random() * 15;
        this.clouds.push({ pos: [cx, cy, cz], nextX: cx, scale: [cw, ch, cd] });
    }
  }

  batch: Gfx3Mesh | null = null;

  async initBatch() {
    const geos: { geo: any, matrix: mat4 }[] = [];
    const ZERO: vec3 = [0,0,0];
    const Q = new Quaternion();
    const { createBoxGeo, combineGeos } = await import('./GameUtils');

    for (const dec of this.decorations) {
        let geo: any;
        if (dec.type === 'trunk') geo = createBoxGeo(1, 1, 1, [0.4, 0.25, 0.1]);
        else if (dec.type === 'leaves') geo = createBoxGeo(1, 1, 1, [0.2, 0.6, 0.1]);
        else if (dec.type === 'building') geo = createBoxGeo(1, 1, 1, [0.55, 0.55, 0.6]);
        else if (dec.type === 'wallN' || dec.type === 'wallS') geo = createBoxGeo(400, 40, 20, [0.3, 0.4, 0.3]);
        else if (dec.type === 'wallE' || dec.type === 'wallW') geo = createBoxGeo(20, 40, 400, [0.3, 0.4, 0.3]);
        else geo = createBoxGeo(1, 1, 1, [0.6, 0.55, 0.45]);
        
        const mat = UT.MAT4_TRANSFORM(dec.pos, ZERO, dec.type.includes('wall') ? [1,1,1] : dec.scale, Q);
        geos.push({ geo, matrix: mat });
    }

    this.batch = combineGeos(geos);
  }
  
  addCrate(x: number, y: number, z: number) {
      const body = gfx3JoltManager.addBox({
          width: 2, height: 2, depth: 2,
          x, y, z,
          motionType: Gfx3Jolt.EMotionType_Dynamic,
          layer: JOLT_LAYER_MOVING,
          settings: { mMassPropertiesOverride: 10 }
      });
      this.crates.push({ body });
  }
  
  update(ts: number) {
      // Animate clouds
      for (const cloud of this.clouds) {
          cloud.nextX += (ts / 1000) * 5; // Move slightly in X
          if (cloud.nextX > 200) {
              cloud.nextX = -200; // loop back
          }
      }
  }

  draw(cameraPos: vec3) {
    this.floor.draw();
    
    if (this.batch) {
        this.batch.draw();
    }
    
    for (const cloud of this.clouds) {
        const ZERO: vec3 = [0,0,0];
        const mat = UT.MAT4_TRANSFORM([cloud.nextX, cloud.pos[1], cloud.pos[2]], ZERO, cloud.scale, Environment.qMat);
        gfx3MeshRenderer.drawMesh(Environment.cloudMesh, mat);
    }
    
    const crateScale: vec3 = [1,1,1];
    for (const crate of this.crates) {
        const pos = crate.body.body.GetPosition();
        const rot = crate.body.body.GetRotation();
        const rotQ = new Quaternion(rot.GetW(), rot.GetX(), rot.GetY(), rot.GetZ());
        const ZERO: vec3 = [0,0,0];
        const mat = UT.MAT4_TRANSFORM([pos.GetX(),pos.GetY(),pos.GetZ()], ZERO, crateScale, rotQ);
        gfx3MeshRenderer.drawMesh(Environment.crateMesh, mat);
    }
  }
}
