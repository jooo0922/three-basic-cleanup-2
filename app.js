'use strict';

/**
 * GLTF 파일을 불러와서 사용하다가 해당 파일의 자원들을 해제하는 방법
 * 
 * GLTFLoader는 최상위 Object3D만을 리턴해주기 때문에, 그 안에서 어떤 material, texture, geometry 등이 사용되었는지 알기는 어려움.
 * 그래서 ResourceTracker의 track 메서드 내부에서 GLTF 파일의 최상단 Scene 객체를 넘겨준 뒤,
 * 해당 씬 아래에 어떤 오브젝트, 머티리얼, 텍스처, 지오메트리 등의 자원이 포함되어있는지 추척해 내려가면서
 * this.resources에 추가해주는 방식을 사용할거임.
 * 
 * 이를 위해서 ResourceTracker 클래스의 track 메서드가 GLTF에서 로드해 온 루트 요소를 받으면 해당 요소의 지오메트리, 재질, 하위 요소를 추적하도록 수정해 줌.
 */

import * as THREE from 'https://threejsfundamentals.org/threejs/resources/threejs/r127/build/three.module.js';

import {
  GLTFLoader
} from 'https://threejsfundamentals.org/threejs/resources/threejs/r127/examples/jsm/loaders/GLTFLoader.js';


// 생성된 자원(여기서 자원이라 함은, 메모리가 할당되는 Three.js의 객체들을 의미함)들을 Set 객체에 추가하거나, Set 객체 내부에 포함된 자원을 폐기하여 메모리를 해제하는 등 자원을 관리하는 클래스를 만듦.
class ResourceTracker {
  constructor() {
    // 참고로 Set 객체는 ES6에서 추가된 객체로써, '중복되지 않는 value들로만 이루어진 집합 객체'라고 보면 됨. 
    // Array와는 달리 같은 value를 중복 포함할 수 없음. 그래서 Set에 이미 존재하는 값을 추가하려고 하면 아무 일도 발생하지 않음.
    this.resources = new Set();
  }

  // GLTF에서 로드한 루트 요소를 받아서 하위 요소 및 자원들을 추적해나가는 메서드
  track(resource) {
    if (!resource) {
      // 전달받은 자원의 지오메트리, 머티리얼, 하위 요소 등이 비어있거나 없을수도 있으므로, 이럴 때는 그냥 전달받은 자원을 돌려주고 함수를 끝냄
      return resource
    }

    // resource.children이나 resource.material은 배열 형식일수도 있으므로, 배열이 맞다면 배열의 각 요소들을 또 따로 추적해 줌.
    // 참고로 Mesh 객체를 생성할 때, material을 하나만 지정할 수도 있지만, 배열로 묶어서 여러 개의 배열을 지정해줄 수도 있음. -> 그래서 material이 배열 형식일 수도 있다고 말하는 것.
    // 또한 맨 아래에서 머티리얼의 uniforms에 할당되어 있었던 텍스처 배열이 자원으로 전달되었다면, 마찬가지로 이 if block을 통과시켜서 각 텍스처들에 대해 따로따로 추적을 시키겠지
    if (Array.isArray(resource)) { // 참고로 Array.isArray() 메서드는 전달한 인자가 배열인지 아닌지 판별해 줌.
      resource.forEach(resource => this.track(resource));
      return resource; // 뭘 하던 항상 resource는 리턴해주고 끝내야 함. track 함수는 자원을 생성할 때 중간에 가로채서 처리하기 때문에, 항상 가로챈 자원을 다시 돌려줘야 함.
    }

    if (resource.dispose || resource instanceof THREE.Object3D) {
      this.resources.add(resource); // 생성자에서 만든 Set 객체에 전달받은 자원을 추가해 줌.
    }

    // 전달받은 요소(맨 처음에는 scene 요소겠지)가 Object3D인지 확인하고, 맞다면 해당 요소의 지오메트리, 머티리얼, 자식요소들을 각각 추적해 줌.
    if (resource instanceof THREE.Object3D) {
      // track 메서드 내부에서 다시 track을 호출함으로써 전달받은 resource의 하위 요소 및 자원들을 따로 추적해 줌.
      this.track(resource.geometry);
      this.track(resource.material);
      this.track(resource.children);
    } else if (resource instanceof THREE.Material) { // 전달받은 자원이 Object3D가 아닌 Material이라면, 그 안의 속성값 중에 텍스처 또는 균등변수가 할당되어 있는지 확인하고, 존재한다면 각각 따로 추적해줌.
      for (const value of Object.values(resource)) { // Object.values() 메서드는 전달받은 객체 형태의 인자에서, 객체의 각 속성값들을 배열로 묶어서 리턴해 줌. 그니까 Material의 속성값들을 배열로 묶은 뒤, 각 인자를 const value에 할당해서 반복문을 순회함.
        if (value instanceof THREE.Texture) {
          this.track(value); // 만약 Material의 속성값들 중에서 Texture가 존재한다면, 그것도 따로 추적해 줌.
        }
      }

      // 만약 전달받은 머티리얼이 ShaderMaterial 같은거라면 uniforms값도 존재하겠지. 그외에 머티리얼도 공식 API 사이트에는 명시되지 않았지만 uniforms 속성값을 갖는 머티리얼들이 있음.
      // 이처럼 전달받은 머티리얼의 속성값들 중에서 균등변수값이 존재하는지도 확인함. 왜냐면 균등변수에도 텍스쳐가 할당되어 있을지 모르니까!
      if (resource.uniforms) {
        for (const value of Object.values(resource.uniforms)) { // 위에서 처럼 uniforms 객체의 속성값에 담긴 값들을 배열로 만들어서 각각의 배열 요소를 const value에 할당하여 순회함. 
          if (value) {
            const uniformValue = value.value; // 각각의 uniforms.균등변수명.value에 값이 할당되어 있다면, 균등변수명.value를 uniformValue 라는 곳에 저장해 둠.

            // indexed-texture 예제에서 uniforms안에 여러 개의 텍스처들을 value로 할당했듯이, 균등변수에 할당된 값들이 텍스처이거나, 또는 여러 개의 텍스처들을 배열로 묶어서 할당했을수도 있음.
            // 만약 둘 중 하나라도 텍스처들이 발견된다면, 얘내들도 마찬가지로 따로 추적해 주도록 함.
            if (uniformValue instanceof THREE.Texture ||
              Array.isArray(uniformValue)) {
              // 지금 보면 알겠지만, 만약에 uniformValue가 여러 개의 텍스처들이 묶인 배열로 전달된거라면, 당연히 위에서 작성한 코드에 따라 전달된 자원이 배열인지 체크해서 각각의 텍스처들에 대해서 따로 추적을 해주겠지
              this.track(uniformValue);
            }
          }
        }
      }
    }

    return resource; // 받은 자원을 다시 돌려 줌.
  }

  // 전달받은 자원을 resources 집합객체 내에서 제거해주는 메서드
  untrack(resource) {
    this.resources.delete(resource);
  }

  // resources 집합객체 내의 Object3D 요소(큐브 메쉬)를 찾아 해당 요소의 부모노드로부터 제거하고, 모든 자원들(텍스처, 머티리얼, 지오메트리)을 폐기하여 메모리를 해제한 뒤, resources 집합객체 내의 모든 요소를 제거하는 메서드
  dispose() {
    // 참고로 Set 객체는 for...of 로 객체 내의 모든 값에 접근이 가능하다.
    for (const resource of this.resources) {
      if (resource instanceof THREE.Object3D) {
        if (resource.parent) {
          // resource 집합객체 요소들 중에서 부모노드가 존재하는 Object3D 객체가 있다면(= 즉, 이 말은 씬에 추가된 큐브 메쉬를 말하는 거겠지), 부모노드로부터 해당 Object3D 객체를 지워주도록 함.
          resource.parent.remove(resource);
        }
      }

      if (resource.dispose) {
        // resource 집합객체 요소들 중 dispose 메서드가 포함된 요소가 존재한다면 해당 요소를 폐기하여 메모리를 해제함. (큐브 메쉬를 제외한 material, geometry, texture 들이 폐기되겠지)
        resource.dispose();
      }
    }

    // mesh는 씬에서 제거하고, material, geometry, texture는 폐기하여 메모리를 해제한 뒤, resources 집합객체 내의 모든 요소를 제거해버림. 
    this.resources.clear();
  }
}

function main() {
  // create WebGLRenderer
  const canvas = document.querySelector('#canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas
  });

  // create camera
  const fov = 75;
  const aspect = 2;
  const near = 0.1;
  const far = 5;
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.z = 2;

  // create scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('lightblue'); // 배경색을 하늘색으로 지정함.

  // DirectionalLight(직사광)을 생성한 뒤 씬에 추가해주는 함수
  function addLight(...pos) {
    const color = 0xFFFFFF;
    const intensity = 1;
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(...pos); // 전달받은 3개의 좌표값들을 하나하나 복사하여 position.x, y, z에 각각 할당함.
    scene.add(light);
  }
  addLight(-1, 2, 4);
  addLight(2, -2, 3);

  /**
   * 직각삼각형에서 tan(angle) = 높이 / 밑변 공식을 활용해서 
   * 밑변 = 높이 / tan(angle)로 육면체가 카메라의 절두체 안으로 들어올 수 있는 육면체 ~ 카메라 사이의 거리값을 구할 수 있음.
   * 
   * 이 거리를 구할 때 GLTF에서 로드한 root 요소의 bounding box 크기(boxSize)와 중심점(boxCenter)을 넘겨줘서 구하는 함수를 만든 것.
   */
  function frameArea(sizeToFitOnScreen, boxSize, boxCenter, camera) {
    const halfSizeToFitOnScreen = sizeToFitOnScreen * 0.5; // 카메라 절두체 화면크기의 절반값. 직각삼각형에서 높이에 해당.
    const halfFovY = THREE.MathUtils.degToRad(camera.fov * 0.5); // 현재 카메라의 시야각(fov)값의 절반값. tan() 메서드에 할당할 각도값. fov는 항상 degree 단위로 계산되기 때문에 tan 메서드에 넣어주려면 radian 단위로 변환해줘야 함.
    const distance = halfSizeToFitOnScreen / Math.tan(halfFovY); // 카메라와 육면체 사이의 거리값. 탄젠트값으로 직각삼각형의 밑변의 길이를 구하는 공식을 정리한 것.

    // 카메라 ~ boundingBox 중심점으로 향하는 벡터를 정규화하여 '방향값만 갖는 단위벡터'로 만듦.
    const direction = (new THREE.Vector3())
      .subVectors(camera.position, boxCenter) // 카메라 위치 좌표값 - boundingBox 중심점 좌표값 이렇게 벡터의 차로 빼서 두 지점 사이의 벡터값을 구함.
      .multiply(new THREE.Vector3(1, 0, 1)) // 일반적으로 카메라의 y좌표값보다 GLTF에서 로드한 물체의 boundingBox y좌표값이 훨씬 더 위쪽에 있다보니 단위벡터가 위쪽으로 향하게 되어버림. 그래서 y좌표값만 0으로 만들어버려서 XZ축에 평행한 방향으로 단위벡터를 만드는 것
      .normalize(); // 길이가 1이고 방향값만 갖는 단위벡터로 정규화시킴.

    camera.position.copy(direction.multiplyScalar(distance).add(boxCenter)); // 카메라 ~ boundingBox 방향의 단위벡터에 distance 거리값을 곱해줘서, distance만큼의 거리와 카메라 ~ boundingBox 방향을 갖는 벡터를 구하고, 그거를 boundingBox 중심점에 더해준 값으로 카메라의 위치값을 정해줌.

    // 절두체의 near는 boxSize의 0.01배, far는 boxSize의 100배로 지정하면, 절두체 안에 boundingBox가 충분히 들어오겠지
    camera.near = boxSize / 100;
    camera.far = boxSize * 100;
    camera.updateProjectionMatrix(); // 카메라의 near, far값을 바꿔줬으니 업데이트를 호출해 줌.

    camera.lookAt(boxCenter.x, boxCenter.y, boxCenter.z); // 카메라가 boundingBox 중심점을 바라보도록 함.
  }

  const gltfLoader = new GLTFLoader(); // gltfLoader를 생성함.
  // GLTFLoader로 gltf 파일을 로드한 뒤, 로드에 성공하면 씬그래프가 담긴 JSON 객체를 전달하면서 resolve를 호출하는 프라미스 객체를 리턴해 줌.
  function loadGLTF(url) {
    return new Promise((resolve, reject) => {
      // gltfLoader.load() 메서드의 onLoadFn, onErrorFn 자리에 각각 프라미스 executor 함수의 두 인자인 resolve, reject를 각각 전달해준거임.
      gltfLoader.load(url, resolve, undefined, reject);
    });
  }

  // 전달받은 초(sec)만큼의 시간이 지나야 resolve 콜백을 호출하는 프라미스 객체를 리턴해주는 함수. 
  // 그니까 이게 뭐냐면, 전달받은 시간값 만큼이 지나기 전까지는 process 비동기 함수 블록 내에서 다음 줄을 실행하지 못하도록 하려고 만든거임.
  function waitSeconds(seconds = 0) { // 기본값 매개변수라고, 해당 함수를 호출할 때 인자 seconds값을 따로 전달받지 못하면 그냥 지정된 기본값인 0을 할당해서 실행하도록 하는 것.
    // new Promise를 생성하자마자 즉각적으로 호출되는 executor 함수는 전달받은 만큼의 시간이 지나면 resolve 콜백함수를 호출하고, 
    // 최종적으로 그 결과값이 담긴 promise 객체를 리턴해 줌.
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  // loadGLTF 함수에 전달해줄 각 gltf 파일들의 url을 저장해 둔 배열
  const fileURLs = [
    'https://threejsfundamentals.org/threejs/resources/models/cartoon_lowpoly_small_city_free_pack/scene.gltf',
    'https://threejsfundamentals.org/threejs/resources/models/3dbustchallange_submission/scene.gltf',
    'https://threejsfundamentals.org/threejs/resources/models/mountain_landscape/scene.gltf',
    'https://threejsfundamentals.org/threejs/resources/models/simple_house_scene/scene.gltf',
  ];

  // fileURLs 안에 있는 gltf 파일들을 시간간격을 두고 차례대로 생성했다가 폐기하는 작업을 비동기로 무한반복 해주는 함수
  async function loadFiles() {
    for (;;) { // 아래의 for...of 반복문을 무한반복시킴.
      for (const url of fileURLs) {
        const resMgr = new ResourceTracker(); // 각 gltf 파일별로 ResourceTracker 인스턴스를 생성함
        const track = resMgr.track.bind(resMgr); // resMgr.track 메서드를 함수로 변환해주는 작업. (track안의 this들이 resMgr을 가리키도록 바인딩도 해줌)
        const gltf = await loadGLTF(url);
        // console.log(gltf);
        /**
         * loadGLTF() 함수는 new Promise를 호출함으로써 프라미스 객체를 리턴해주니까, gltf에는 프라미스 객체가 리턴되어야 하는거 아닐까?
         * 근데 막상 콘솔로 찍어보면 gltf에는 JSON 객체가 담겨있다.
         * 
         * 그러면 프라미스 객체가 아니라 JSON 객체를 리턴해준다는 말인가?
         * 그건 아니다. loadGLTF() 함수는 분명 프라미스 객체만 리턴해준다.
         * 
         * 그러면 어떻게 const gltf에는 resolve가 리턴해주는 프라미스 객체의 result값인 JSON이 담긴다는 말인가?
         * 왜냐하면, loadGLTF() 함수를 호출할 때 선언하는 await 키워드 덕분이지.
         * await는 Promise.then()과 같아서, 프라미스 객체를 리턴해주는 게 아닌, 프라미스 객체 안에 존재하는, resolve 또는 reject 콜백함수에 의해 결정되는
         * result값을 리턴해 줌. Promise.then와 동일한 기능이지만, 좀 더 세련되고 가독성이 좋게 사용하여 result값을 얻도록 해주는 키워드임.
         * 
         * 사실 promise, async/await 공부하면 다 아는 기본적인 개념인데 공부를 제대로 안했던 것 같다...ㅠ
         */
        const root = track(gltf.scene); // JSON의 루트요소인 scene 객체를 track 함수로 하위 요소 및 자원들을 모조리 추적한 다음, gltf.scene을 다시 const root에 돌려줌.
        scene.add(root); // 씬에 돌려받은 gltf.scene을 추가해 줌.

        const box = new THREE.Box3().setFromObject(root); // 3D 공간상에서 gltf.scene 객체를 감싸는 boundingBox 객체를 리턴해 줌.
        const boxSize = box.getSize(new THREE.Vector3()).length(); // (0, 0, 0)지점부터 boundingBox의 (width, height, depth) 지점까지의 '유클리드 길이(직선 길이)'를 구해줌. 즉, boundingBox를 대각선 방향으로 가로지르는 선의 길이를 계산하여 리턴해 줌.
        const boxCenter = box.getCenter(new THREE.Vector3()); // boundingBox의 가운데 좌표값을 계산해서 인자로 전달한 Vector3에 복사하여 리턴해 줌.

        // 위에서 구한 boundingBox의 길이값, 중심점 좌표값을 전달해서 카메라의 위치값 및 절두체 사이즈를 재조정함.
        frameArea(boxSize * 1.1, boxSize, boxCenter, camera); // 참고로 1.1을 곱해주는건 Fudge(속임수값)이라고 보면 됨. 절두체 사이즈 계산 시 boundingBox의 가장자리가 짤리지 않도록 좀 더 넉넉한 사이즈값을 전달해주는 것.
        // 여기까지만 해주면 로드된 gltf 물체가 화면에 나타나기 시작할거임.

        await waitSeconds(2); // 화면에 물체가 나타나고 나서 2초 동안 시간을 지연하다가 다음 줄로 넘어가도록 함.
        renderer.render(scene, camera); // 사실 이거는 코멘트 처리해도 아무 변화가 없음. 왜냐면 이미 animate 함수가 비동기로 실행되니까 알아서 렌더해주고 있음. 왜 쓴건지는 잘 모르겠음.

        resMgr.dispose(); // 어쨋든 물체가 화면에 나타난 지 2초가 지나면 해당 gltf의 하위 요소 및 자원들 중 Object3D 요소는 씬에서 제거하고, 폐기할 수 있는 자원은 폐기해버림.

        await waitSeconds(1); // 물체가 폐기되어 화면에서 사라지고 나면 1초 동안 시간을 또 지연시킴. 1초가 지나면 다음 for...of 반복문으로 넘어가서 다음 차례의 gltf를 로드해서 화면에 띄워주겠지.
      }
    }
  }
  loadFiles(); // loadFiles() 함수와 아래의 리사이징 및 애니메이션 관련 함수들을 비동기로 실행시킴.

  // resize renderer
  function resizeRendererToDisplaySize(renderer) {
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
      renderer.setSize(width, height, false);
    }

    return needResize;
  }

  // animate
  function animate() {
    // 렌더러가 리사이징되면 변경된 사이즈에 맞춰서 카메라 비율(aspect)도 업데이트 해줌.
    if (resizeRendererToDisplaySize(renderer)) {
      const canvas = renderer.domElement;
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    }

    renderer.render(scene, camera);

    requestAnimationFrame(animate); // 내부에서 반복 호출
  }

  requestAnimationFrame(animate);
}

main();