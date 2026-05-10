import { gfx3JoltManager, JOLT_LAYER_MOVING, Gfx3Jolt } from '@lib/gfx3_jolt/gfx3_jolt_manager';
import { Gfx3Mesh } from '@lib/gfx3_mesh/gfx3_mesh';
import { Gfx3MeshJSM } from '@lib/gfx3_mesh/gfx3_mesh_jsm';
import { gfx3MeshRenderer } from '@lib/gfx3_mesh/gfx3_mesh_renderer';
import { Quaternion } from '@lib/core/quaternion';
import { UT } from '@lib/core/utils';
import { createBoxMesh } from './GameUtils';
import { Preloader } from './Preloader';

/**
 * The Tank class represents the player-controlled vehicle.
 */
export class Tank {
  body: Gfx3Mesh;
  turret: Gfx3Mesh;
  barrel: Gfx3Mesh;
  trackL: Gfx3Mesh;
  trackR: Gfx3Mesh;
  engine: Gfx3Mesh;
  hatch: Gfx3Mesh;
  antenna: Gfx3Mesh;
  physicsBody: any;
  velocity: number = 0;
  rotation: number = 0;
  recoil: number = 0;
  turretYaw: number = 0;
  wasFiringInternal: boolean = false;
  currentUp: vec3 = [0, 1, 0];
  
  // Bullets instances
  projectiles: { body: any, life: number, rot: Quaternion, type: 'normal' | 'grenade', lastVel: [number, number, number] }[] = [];

  static projMesh: Gfx3Mesh | null = null;
  static projGrenadeMesh: Gfx3Mesh | null = null;

  constructor() {
    const chassisColor: [number, number, number] = [0.4, 0.5, 0.3];
    const turretColor: [number, number, number] = [0.35, 0.45, 0.25];
    const trackColor: [number, number, number] = [0.15, 0.15, 0.15];
    const engineColor: [number, number, number] = [0.2, 0.2, 0.2];

    // Initial placeholders or preloaded JSM if available
    if (Preloader.isLoaded) {
      this.body = Preloader.getModel('/models/tank_body.jsm');
      this.turret = Preloader.getModel('/models/tank_turret.jsm');
      this.barrel = Preloader.getModel('/models/tank_barrel.jsm');
    } else {
      this.body = createBoxMesh(2.25, 0.9, 3.3, chassisColor);
      this.turret = createBoxMesh(1.65, 0.75, 1.65, turretColor);
      this.barrel = createBoxMesh(0.3, 0.3, 2.25, [0.2, 0.2, 0.2]);
    }

    this.trackL = createBoxMesh(0.6, 0.9, 3.6, trackColor);
    this.trackR = createBoxMesh(0.6, 0.9, 3.6, trackColor);
    this.engine = createBoxMesh(1.8, 0.6, 0.9, engineColor);
    this.hatch = createBoxMesh(0.6, 0.15, 0.6, [0.15, 0.15, 0.15]);
    this.antenna = createBoxMesh(0.05, 1.5, 0.05, [0.1, 0.1, 0.1]);

    if (!Tank.projMesh) {
      Tank.projMesh = createBoxMesh(0.4, 0.4, 1.0, [1.0, 0.8, 0.2]);
      Tank.projMesh.setShadowCasting(true);
    }
    if (!Tank.projGrenadeMesh) {
      Tank.projGrenadeMesh = createBoxMesh(0.5, 0.5, 0.5, [0.2, 0.2, 0.2]);
      Tank.projGrenadeMesh.setShadowCasting(true);
    }

    this.physicsBody = gfx3JoltManager.addBox({
      width: 3.45, height: 0.9, depth: 3.6,
      x: 0, y: 0.5, z: 0,
      motionType: Gfx3Jolt.EMotionType_Dynamic,
      layer: JOLT_LAYER_MOVING,
      settings: { mAngularDamping: 1.0, mLinearDamping: 0.5, mMassPropertiesOverride: 100.0, mAllowedDOFs: 7 }
    });
  }

  /**
   * Loads high-fidelity JSM models for the tank components.
   * Now mostly uses Preloader but kept for compatibility.
   */
  async load() {
    if (Preloader.isLoaded) {
      this.body = Preloader.getModel('/models/tank_body.jsm');
      this.turret = Preloader.getModel('/models/tank_turret.jsm');
      this.barrel = Preloader.getModel('/models/tank_barrel.jsm');
      return;
    }

    const bodyJSM = new Gfx3MeshJSM();
    const turretJSM = new Gfx3MeshJSM();
    const barrelJSM = new Gfx3MeshJSM();

    try {
      await Promise.all([
        bodyJSM.loadFromFile('/models/tank_body.jsm'),
        turretJSM.loadFromFile('/models/tank_turret.jsm'),
        barrelJSM.loadFromFile('/models/tank_barrel.jsm')
      ]);

      this.body = bodyJSM;
      this.turret = turretJSM;
      this.barrel = barrelJSM;
    } catch (e) {
      console.warn('Fallback loading failed for JSM.', e);
    }
  }

  update(ts: number, moveDir: { x: number, y: number }, fireType: 'none' | 'normal' | 'grenade' = 'none', cameraYaw: number = 0, cameraPitch: number = 0) {
    const speed = 18;
    const rotSpeed = 3.8;
    const dt = ts / 1000;

    let didShoot: false | 'normal' | 'grenade' = false;
    if (fireType !== 'none') {
        if (this.recoil <= 0) {
            this.shoot(fireType);
            this.recoil = 1.0;
            didShoot = fireType;
        }
        this.wasFiringInternal = true;
    } else {
        this.wasFiringInternal = false;
    }

    this.recoil -= dt * 5; 
    if (this.recoil < 0) this.recoil = 0;
    
    this.rotation -= moveDir.x * rotSpeed * dt; 
    
    const throttle = moveDir.y;
    const targetVelocity = throttle * speed;
    this.velocity = UT.LERP(this.velocity, targetVelocity, throttle !== 0 ? 0.06 : 0.12);

    const forward = [-Math.sin(this.rotation), 0, -Math.cos(this.rotation)] as vec3;
    const linVel = UT.VEC3_SCALE(forward, this.velocity);
    
    const curVel = this.physicsBody.body.GetLinearVelocity();
    const joltLinVel = new Gfx3Jolt.Vec3(linVel[0], curVel.GetY(), linVel[2]);
    gfx3JoltManager.bodyInterface.SetLinearVelocity(this.physicsBody.body.GetID(), joltLinVel);
    
    const pos = this.physicsBody.body.GetPosition();
    let quat = Quaternion.createFromEuler(this.rotation, 0, 0, 'YXZ');
    
    // Smooth Ground Alignment (Already optimized in last session)
    const hw = 1.4, hd = 1.6;
    const sinYaw = Math.sin(this.rotation), cosYaw = Math.cos(this.rotation);
    const fx = -sinYaw, fz = -cosYaw, rx = cosYaw, rz = -sinYaw;
    const cx = pos.GetX(), cy = pos.GetY(), cz = pos.GetZ();

    const getHitPoint = (dx: number, dz: number): vec3 => {
      const wx = cx + rx * dx + fx * dz, wz = cz + rz * dx + fz * dz;
      const ray = gfx3JoltManager.createRay(wx, cy, wz, wx, cy - 3.0, wz);
      return ray.fraction < 1.0 ? [wx, cy - ray.fraction * 3.0, wz] : [wx, cy - 1.5, wz]; 
    };

    const fl = getHitPoint(-hw, hd), fr = getHitPoint(hw, hd), bl = getHitPoint(-hw, -hd), br = getHitPoint(hw, -hd);
    const vecFront = UT.VEC3_SCALE(UT.VEC3_ADD(fl, fr), 0.5), vecBack = UT.VEC3_SCALE(UT.VEC3_ADD(bl, br), 0.5);
    const vecLeft = UT.VEC3_SCALE(UT.VEC3_ADD(fl, bl), 0.5), vecRight = UT.VEC3_SCALE(UT.VEC3_ADD(fr, br), 0.5);
    const vForward = UT.VEC3_NORMALIZE(UT.VEC3_SUBSTRACT(vecFront, vecBack)), vRight = UT.VEC3_NORMALIZE(UT.VEC3_SUBSTRACT(vecRight, vecLeft));

    let targetUp = UT.VEC3_CROSS(vRight, vForward);
    if (UT.VEC3_LENGTH(targetUp) < 0.001) targetUp = [0, 1, 0];
    else {
        targetUp = UT.VEC3_NORMALIZE(targetUp);
        if (targetUp[1] < 0) targetUp = UT.VEC3_SCALE(targetUp, -1);
    }
    
    this.currentUp = UT.VEC3_LERP(this.currentUp, targetUp, 6.0 * dt);
    this.currentUp = UT.VEC3_NORMALIZE(this.currentUp);

    const up: vec3 = [0, 1, 0];
    let axis = UT.VEC3_CROSS(up, this.currentUp);
    const dot = UT.VEC3_DOT(up, this.currentUp);
    if (UT.VEC3_LENGTH(axis) > 0.001 && Math.abs(dot) < 0.999) {
        axis = UT.VEC3_NORMALIZE(axis);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        quat = Quaternion.multiply(Quaternion.createFromAxisAngle(axis, angle), quat);
    }

    this.body.setPosition(pos.GetX(), pos.GetY(), pos.GetZ());
    this.body.setQuaternion(quat);

    // Sync Attachments
    const q = quat;
    const trackOffsetL = q.rotateVector([-1.425, -0.15, 0]);
    this.trackL.setPosition(cx + trackOffsetL[0], cy + trackOffsetL[1], cz + trackOffsetL[2]);
    this.trackL.setQuaternion(q);

    const trackOffsetR = q.rotateVector([1.425, -0.15, 0]);
    this.trackR.setPosition(cx + trackOffsetR[0], cy + trackOffsetR[1], cz + trackOffsetR[2]);
    this.trackR.setQuaternion(q);

    const engineOffset = q.rotateVector([0, 0.3, 1.8]);
    this.engine.setPosition(cx + engineOffset[0], cy + engineOffset[1], cz + engineOffset[2]);
    this.engine.setQuaternion(q);

    let yawDiff = cameraYaw - this.turretYaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    
    const turretTraverseSpeed = 1.8;
    const traverseAmount = turretTraverseSpeed * dt;
    if (Math.abs(yawDiff) < traverseAmount) this.turretYaw = cameraYaw;
    else this.turretYaw += Math.sign(yawDiff) * traverseAmount;
    
    const turretQ = Quaternion.multiply(q, Quaternion.createFromEuler(this.turretYaw - this.rotation, 0, 0, 'YXZ'));
    const barrelQ = Quaternion.multiply(turretQ, Quaternion.createFromEuler(0, cameraPitch, 0, 'YXZ'));

    const turretOffset = q.rotateVector([0, 0.675, 0]);
    const tpx = cx + turretOffset[0], tpy = cy + turretOffset[1], tpz = cz + turretOffset[2];
    this.turret.setPosition(tpx, tpy, tpz);
    this.turret.setQuaternion(turretQ);

    const visualRecoil = this.recoil > 0 ? this.recoil * 0.45 : 0;
    const barrelRel = barrelQ.rotateVector([0, 0, -1.2 + visualRecoil]);
    this.barrel.setPosition(tpx + barrelRel[0], tpy + barrelRel[1], tpz + barrelRel[2]);
    this.barrel.setQuaternion(barrelQ);
    
    const hatchOffset = turretQ.rotateVector([0, 0.45, 0.3]);
    this.hatch.setPosition(tpx + hatchOffset[0], tpy + hatchOffset[1], tpz + hatchOffset[2]);
    this.hatch.setQuaternion(turretQ);
    
    const antOffset = turretQ.rotateVector([-0.6, 1.125, 0.6]);
    this.antenna.setPosition(tpx + antOffset[0], tpy + antOffset[1], tpz + antOffset[2]);
    this.antenna.setQuaternion(turretQ);
    
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
       const p = this.projectiles[i];
       p.life -= dt;
       if (p.life <= 0) {
          gfx3JoltManager.remove(p.body.bodyId);
          this.projectiles.splice(i, 1);
       } else if (p.type === 'normal') {
          const curV = p.body.body.GetLinearVelocity();
          p.lastVel = [curV.GetX(), curV.GetY(), curV.GetZ()];
          const vLen = Math.sqrt(p.lastVel[0]**2 + p.lastVel[1]**2 + p.lastVel[2]**2);
          if (vLen > 0.1) {
              const yaw = Math.atan2(-p.lastVel[0]/vLen, -p.lastVel[2]/vLen);
              const pitch = Math.asin(Math.max(-1, Math.min(1, -p.lastVel[1]/vLen)));
              p.rot = Quaternion.multiply(Quaternion.createFromAxisAngle([0, 1, 0], yaw), Quaternion.createFromAxisAngle([1, 0, 0], pitch));
          }
       }
    }
    
    return didShoot;
  }
  
  shoot(type: 'normal' | 'grenade' = 'normal') {
    const q = this.barrel.getQuaternion();
    const direction = q.rotateVector([0, 0, -1]); 
    const bPos = this.barrel.getPosition();
    const startPos = [bPos[0] + direction[0] * 1.5, bPos[1] + direction[1] * 1.5, bPos[2] + direction[2] * 1.5];
    
    const pBody = gfx3JoltManager.addBox({
      width: 0.4, height: 0.4, depth: type === 'grenade' ? 0.5 : 1.0,
      x: startPos[0], y: startPos[1], z: startPos[2],
      motionType: Gfx3Jolt.EMotionType_Dynamic,
      layer: JOLT_LAYER_MOVING,
      settings: { mMassPropertiesOverride: 0.01, mRestitution: 0.0, mMotionQuality: Gfx3Jolt.EMotionQuality_LinearCast }
    });
    
    let fwdSpeed = type === 'grenade' ? 28 : 55;
    let upVel = type === 'grenade' ? 14 : 0.4;
    
    const pVel = new Gfx3Jolt.Vec3(direction[0] * fwdSpeed, (direction[1] * fwdSpeed) + upVel, direction[2] * fwdSpeed);
    gfx3JoltManager.bodyInterface.SetLinearVelocity(pBody.body.GetID(), pVel);

    if (type === 'grenade') {
        gfx3JoltManager.bodyInterface.SetAngularVelocity(pBody.body.GetID(), new Gfx3Jolt.Vec3(Math.random()*15, Math.random()*15, Math.random()*15));
    }
    
    this.projectiles.push({ body: pBody, life: 2.8, rot: q, type, lastVel: [pVel.GetX(), pVel.GetY(), pVel.GetZ()] });
  }

  draw() {
    const zero: vec3 = [0, 0, 0];
    const scale: vec3 = [1, 1, 1];

    gfx3MeshRenderer.drawInstancedMesh(this.body, this.body.getTransformMatrix());
    gfx3MeshRenderer.drawInstancedMesh(this.trackL, this.trackL.getTransformMatrix());
    gfx3MeshRenderer.drawInstancedMesh(this.trackR, this.trackR.getTransformMatrix());
    gfx3MeshRenderer.drawInstancedMesh(this.engine, this.engine.getTransformMatrix());
    gfx3MeshRenderer.drawInstancedMesh(this.turret, this.turret.getTransformMatrix());
    gfx3MeshRenderer.drawInstancedMesh(this.barrel, this.barrel.getTransformMatrix());
    gfx3MeshRenderer.drawInstancedMesh(this.hatch, this.hatch.getTransformMatrix());
    gfx3MeshRenderer.drawInstancedMesh(this.antenna, this.antenna.getTransformMatrix());
    
    if (Tank.projMesh && Tank.projGrenadeMesh) {
      for (const p of this.projectiles) {
         const mesh = p.type === 'grenade' ? Tank.projGrenadeMesh : Tank.projMesh;
         const pPos = p.body.body.GetPosition();
         let q = p.rot;
         if (p.type === 'grenade') {
             const pRot = p.body.body.GetRotation();
             q = new Quaternion(pRot.GetW(), pRot.GetX(), pRot.GetY(), pRot.GetZ());
         }
         const mat = UT.MAT4_TRANSFORM([pPos.GetX(), pPos.GetY(), pPos.GetZ()], zero, scale, q);
         gfx3MeshRenderer.drawInstancedMesh(mesh, mat);
      }
    }
  }
}

