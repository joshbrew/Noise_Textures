# Noise_Textures

Multithreaded heightmap/noise texture generation tests for a bunch of different noise algorithms. 35+ variants plus some spherical and planar terrain generation tests, and some vector field tests with WIP erosion sims. Needs to move to the GPU but it's not that slow and the resolution is theoretically infinite. 

Run `npm i -g tinybuild` then `tinybuild` to build/run the project. Babylonjs is using webgpu so use a chrome based browser, or android.

### [Noise, Planets, Terrain, and Vector Field samples](https://planetsim.netlify.app) (takes several seconds to render!!)

Eventually I'll roll this all into one as a fun terrain or texture mixing tool but there's a lot of optimizing to do inbetween slamming features in.

<table>
  <tr>
    <td><img width="842" alt="339234544-422dca76-cd6f-4410-80b2-2aa03e2c29f0-min" src="https://github.com/joshbrew/Noise_Textures/assets/18196383/2a6bd0b6-f8e9-4413-96f2-07952beccdc1"></td>
    <td><img width="499" alt="Capture6-min" src="https://github.com/joshbrew/Noise_Textures/assets/18196383/4db3773d-f86b-42ea-bc26-c35505b08a10">
</td>
    <td><img width="652" alt="Capture-min (3)" src="https://github.com/joshbrew/Noise_Textures/assets/18196383/5e96d832-6e6a-44a6-bf6f-a809559cd721"></td>
  </tr>
</table>

<table>
  <tr>
    <td>
      <img width="1835" alt="Capture2-min" src="https://github.com/joshbrew/Noise_Textures/assets/18196383/98a2162d-2154-4e5f-b09c-47aae891c0aa">
    </td>
    <td>
      <img width="466" alt="Capture" src="https://github.com/joshbrew/Noise_Textures/assets/18196383/b99793fd-1cc4-4774-9e10-bb86255448f3">
    </td>
  </tr>
    <tr>  
    <td colSpan="2">
      <img width="1516" alt="Capture-min (5)" src="https://github.com/joshbrew/Noise_Textures/assets/18196383/2718550c-06b9-48b5-9122-ee3ec5ab17ef">
    </td>
    </tr>
</table>

<table>
  <tr>
    <td><img width="554" alt="339214027-e36ca3fd-56f0-4107-8bd3-377a0b692c24-min" src="https://github.com/joshbrew/Noise_Textures/assets/18196383/408c392d-d7ef-4522-9203-bc20556c64fb"></td>
    <td><img width="690" alt="338783672-30bf28a2-3311-4864-b58a-236d8cb17ced-min" src="https://github.com/joshbrew/Noise_Textures/assets/18196383/3d076da4-233c-4f79-8ba6-a0104e94f252"></td>
    <td>
  <img width="783" alt="339095194-784027a9-8e87-45c6-9cdc-51f3dbf25b26-min" src="https://github.com/joshbrew/Noise_Textures/assets/18196383/484a3e19-8c17-40d1-8e7a-a514c5ea92ac">
    </td>
  </tr>
</table>


<table>
  <tr>
    <td>
      <img width="636" alt="Capture5-min" src="https://github.com/joshbrew/Noise_Textures/assets/18196383/1bbd1687-36fe-4569-8f13-0517a3b6bae4">
    </td>
    <td>
      <img width="466" alt="Capture" src="https://github.com/joshbrew/Noise_Textures/assets/18196383/da18e2c5-54ca-41cb-af99-b8eff811ce72">
    </td>
  </tr>
</table>


