import { JOLT_LAYER_MOVING, JOLT_RVEC3_TO_VEC3, Gfx3Jolt, gfx3JoltManager } from '@lib/gfx3_jolt/gfx3_jolt_manager';
import { Gfx3Mesh } from '@lib/gfx3_mesh/gfx3_mesh';
import { Gfx3MeshJSM } from '@lib/gfx3_mesh/gfx3_mesh_jsm';
import { gfx3MeshRenderer } from '@lib/gfx3_mesh/gfx3_mesh_renderer';
import { Quaternion } from '@lib/core/quaternion';
import { UT } from '@lib/core/utils';
import { createBoxMesh } from './GameUtils';
import { Preloader } from './Preloader';

/**
 * The Enemy class represents an AI-controlled tank.
 */
export class Enemy {
  static bodyMesh: Gfx3Mesh;
  static turretMesh: Gfx3Mesh;
  static barrelMesh: Gfx3Mesh;
  static trackLMesh: Gfx3Mesh;
  static trackRMesh: Gfx3Mesh;
  static engineMesh: Gfx3Mesh;
  static projMesh: Gfx3Mesh;
  static initialized = false;

  static async initMeshes() {
    if (Enemy.initialized) return;
    const chassisColor: [number, number, number] = [0.8, 0.2, 0.2]; 
    const turretColor: [number, number, number] = [0.6, 0.1, 0.1];
    const trackColor: [number, number, number] = [0.15, 0.15, 0.15];

    if (Preloader.isLoaded) {
      Enemy.bodyMesh = Preloader.getModel('/models/tank_body.jsm');
      Enemy.turretMesh = Preloader.getModel('/models/tank_turret.jsm');
      Enemy.barrelMesh = Preloader.getModel('/models/tank_barrel.jsm');
    } else {
      Enemy.bodyMesh = createBoxMesh(1.5, 0.6, 2.2, chassisColor);
      Enemy.turretMesh = createBoxMesh(1.1, 0.5, 1.1, turretColor);
      Enemy.barrelMesh = createBoxMesh(0.2, 0.2, 1.5, [0.2, 0.2, 0.2]);
    }

    Enemy.trackLMesh = createBoxMesh(0.4, 0.6, 2.4, trackColor);
    Enemy.trackRMesh = createBoxMesh(0.4, 0.6, 2.4, trackColor);
    Enemy.engineMesh = createBoxMesh(1.2, 0.4, 0.6, [0.2, 0.2, 0.2]);
    Enemy.projMesh = createBoxMesh(0.5, 0.5, 0.5, [1.0, 0.2, 0.0]);

    Enemy.initialized = true;
  }

  physicsBody: any;
  rotation: number = 0;
  recoil: number = 0;
  shootCooldown: number = 0;
  hp: number = 100;
  currentUp: vec3 = [0, 1, 0];
  projectiles: { body: any, life: number, rot: Quaternion, lastVel: [number, number, number] }[] = [];

  constructor(x: number, y: number, z: number) {
    if (!Enemy.initialized) Enemy.initMeshes();

    this.physicsBody = gfx3JoltManager.addBox({
      width: 1.5, height: 0.6, depth: 2.2,
      x, y, z,
      motionType: Gfx3Jolt.EMotionType_Dynamic,
      layer: JOLT_LAYER_MOVING,
      settings: { mAngularDamping: 2.0, mLinearDamping: 1.5, mMassPropertiesOverride: 100.0 }
    });
  }

  update(ts: number, targetPos: any): { didShoot: boolean, muzzlePos?: vec3, dir?: vec3 } {
    const dt = ts / 1000;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
       const p = this.projectiles[i];
       p.life -= dt;
       if (p.life <= 0) {
          gfx3JoltManager.remove(p.body.bodyId);
          this.projectiles.splice(i, 1);
       } else {
          const curV = p.body.body.GetLinearVelocity();
          p.lastVel = [curV.GetX(), curV.GetY(), curV.GetZ()];
       }
    }

    if (this.hp <= 0) return { didShoot: false };

    this.recoil -= dt * 5; 
    if (this.recoil < 0) this.recoil = 0;
    this.shootCooldown -= dt;

    const pos = this.physicsBody.body.GetPosition();
    const cx = pos.GetX(), cy = pos.GetY(), cz = pos.GetZ();
    
    const dx = targetPos[0] - cx, dz = targetPos[2] - cz;
    const dist = Math.sqrt(dx*dx + dz*dz);
    const targetAngle = Math.atan2(-dx, -dz);
    
    const PI2 = Math.PI * 2;
    let angleDiff = (targetAngle - this.rotation) % PI2;
    if (angleDiff > Math.PI) angleDiff -= PI2;
    if (angleDiff < -Math.PI) angleDiff += PI2;
    
    this.rotation += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 2.2 * dt);
    
    const speed = 7;
    let throttle = dist > 15 ? 1 : (dist < 10 ? -0.5 : 0);

    const forward = [-Math.sin(this.rotation), 0, -Math.cos(this.rotation)] as vec3;
    const linVel = UT.VEC3_SCALE(forward, throttle * speed);
    const curVel = this.physicsBody.body.GetLinearVelocity();
    gfx3JoltManager.bodyInterface.SetLinearVelocity(this.physicsBody.body.GetID(), new Gfx3Jolt.Vec3(linVel[0], curVel.GetY(), linVel[2]));
    
    let quat = Quaternion.createFromEuler(this.rotation, 0, 0, 'YXZ');
    const ray = gfx3JoltManager.createRay(cx, cy + 0.5, cz, cx, cy - 2.0, cz);
    if (ray.normal) {
        const targetUp: vec3 = [ray.normal.GetX(), ray.normal.GetY(), ray.normal.GetZ()];
        this.currentUp = UT.VEC3_LERP(this.currentUp, targetUp, 6.0 * dt);
    }
    this.currentUp = UT.VEC3_NORMALIZE(this.currentUp);

    let axis = UT.VEC3_CROSS([0, 1, 0], this.currentUp);
    const dot = UT.VEC3_DOT([0, 1, 0], this.currentUp);
    if (UT.VEC3_LENGTH(axis) > 0.001 && Math.abs(dot) < 0.999) {
        axis = UT.VEC3_NORMALIZE(axis);
        quat = Quaternion.multiply(Quaternion.createFromAxisAngle(axis, Math.acos(Math.max(-1, Math.min(1, dot)))), quat);
    }

    gfx3JoltManager.bodyInterface.SetRotation(this.physicsBody.body.GetID(), new Gfx3Jolt.Quat(quat.x, quat.y, quat.z, quat.w), Gfx3Jolt.EActivation_Activate);
    
    let didShoot = false, muzzlePos: vec3 | undefined, dir: vec3 | undefined;
    if (dist < 45 && Math.abs(angleDiff) < 0.25 && this.shootCooldown <= 0) {
        const res = this.shoot(quat);
        muzzlePos = res.muzzlePos; dir = res.dir;
        this.shootCooldown = 2.5; this.recoil = 1.0;
        didShoot = true;
    }
    
    return { didShoot, muzzlePos, dir };
  }
  
  shoot(q: Quaternion): { muzzlePos: vec3, dir: vec3 } {
    const direction = q.rotateVector([0, 0, -1]); 
    const pos = this.physicsBody.body.GetPosition();
    const cx = pos.GetX(), cy = pos.GetY(), cz = pos.GetZ();
    const recoil = this.recoil > 0 ? this.recoil * 0.3 : 0;
    const bRel = q.rotateVector([0, 0.45, -0.8 + recoil]);
    const bPos = [cx + bRel[0], cy + bRel[1], cz + bRel[2]];
    const startPos = [bPos[0] + direction[0] * 1.5, bPos[1] + direction[1] * 1.5, bPos[2] + direction[2] * 1.5];
    
    const pBody = gfx3JoltManager.addBox({
      width: 0.5, height: 0.5, depth: 0.5,
      x: startPos[0], y: startPos[1], z: startPos[2],
      motionType: Gfx3Jolt.EMotionType_Dynamic, layer: JOLT_LAYER_MOVING,
      settings: { mMassPropertiesOverride: 0.01, mRestitution: 0.0, mMotionQuality: Gfx3Jolt.EMotionQuality_LinearCast }
    });
    
    const pVel = new Gfx3Jolt.Vec3(direction[0] * 32, (direction[1] * 32) + 14, direction[2] * 32);
    gfx3JoltManager.bodyInterface.SetLinearVelocity(pBody.body.GetID(), pVel);
    gfx3JoltManager.bodyInterface.AddImpulse(this.physicsBody.body.GetID(), new Gfx3Jolt.Vec3(-direction[0] * 400, -direction[1] * 400, -direction[2] * 400));
    
    this.projectiles.push({ body: pBody, life: 3.0, rot: q, lastVel: [pVel.GetX(), pVel.GetY(), pVel.GetZ()] });
    return { muzzlePos: [startPos[0], startPos[1], startPos[2]] as vec3, dir: [direction[0], direction[1], direction[2]] as vec3 };
  }

  draw() {
    const scale: vec3 = [1, 1, 1], zero: vec3 = [0,0,0];
    for (const p of this.projectiles) {
       const pp = p.body.body.GetPosition(), pr = p.body.body.GetRotation();
       const mat = UT.MAT4_TRANSFORM([pp.GetX(), pp.GetY(), pp.GetZ()], zero, scale, new Quaternion(pr.GetW(), pr.GetX(), pr.GetY(), pr.GetZ()));
       gfx3MeshRenderer.drawInstancedMesh(Enemy.projMesh, mat);
    }
    
    if (this.hp <= 0) return;
    const pos = this.physicsBody.body.GetPosition(), rot = this.physicsBody.body.GetRotation();
    const cx = pos.GetX(), cy = pos.GetY(), cz = pos.GetZ();
    const q = new Quaternion(rot.GetW(), rot.GetX(), rot.GetY(), rot.GetZ());
    const origin: vec3 = [cx, cy, cz];

    gfx3MeshRenderer.drawInstancedMesh(Enemy.bodyMesh, UT.MAT4_TRANSFORM(origin, zero, scale, q));
    const tL = q.rotateVector([-0.8, -0.1, 0]);
    gfx3MeshRenderer.drawInstancedMesh(Enemy.trackLMesh, UT.MAT4_TRANSFORM([cx + tL[0], cy + tL[1], cz + tL[2]], zero, scale, q));
    const tR = q.rotateVector([0.8, -0.1, 0]);
    gfx3MeshRenderer.drawInstancedMesh(Enemy.trackRMesh, UT.MAT4_TRANSFORM([cx + tR[0], cy + tR[1], cz + tR[2]], zero, scale, q));
    const eng = q.rotateVector([0, 0.2, 1.2]);
    gfx3MeshRenderer.drawInstancedMesh(Enemy.engineMesh, UT.MAT4_TRANSFORM([cx + eng[0], cy + eng[1], cz + eng[2]], zero, scale, q));
    const tur = q.rotateVector([0, 0.45, 0]);
    gfx3MeshRenderer.drawInstancedMesh(Enemy.turretMesh, UT.MAT4_TRANSFORM([cx + tur[0], cy + tur[1], cz + tur[2]], zero, scale, q));
    const recoil = this.recoil > 0 ? this.recoil * 0.3 : 0;
    const bar = q.rotateVector([0, 0, -0.8 + recoil]);
    gfx3MeshRenderer.drawInstancedMesh(Enemy.barrelMesh, UT.MAT4_TRANSFORM([cx + tur[0] + bar[0], cy + tur[1] + bar[1], cz + tur[2] + bar[2]], zero, scale, q));
  }
}
