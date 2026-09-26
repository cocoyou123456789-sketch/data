/* Source: user-supplied HLS II和HALF表征方法.pptx, slides 3–4.
 * Coordinates traced approximately from slide 3; not engineering dimensions.
 * English names are translations; Chinese names and ranges follow slide 4. */
(function (root) {
  const rows = [
    ['能源转换及天体化学光电离质谱线站','Energy conversion & astrochemistry',5,20,'气相反应中间体的高灵敏度探测','Sensitive detection of gas-phase reaction intermediates',['光电离质谱'],['Photoionization mass spectrometry'],[343,690],[278,569]],
    ['极紫外电子态表征及光刻工艺线站','EUV electronic states & lithography',6,135,'兼顾高能量分辨和高空间分辨','High energy and spatial resolution',['真空紫外角分辨光电子能谱'],['VUV angle-resolved photoemission spectroscopy'],[873,650],[909,775]],
    ['微纳器件工况电子态表征线站','Operando micro/nano-device electronic states',80,1000,'高空间分辨、自旋分辨、工况条件器件电子结构','Spatially and spin-resolved electronic structure under operating conditions',['纳米分辨角分辨光电子能谱','软X射线角分辨光电子能谱'],['Nano-ARPES','Soft X-ray ARPES'],[460,437],[706,354]],
    ['高灵敏自旋时空分辨线站','Sensitive spatiotemporal spin characterization',250,2000,'高时空分辨、高灵敏度的磁性测量','Sensitive magnetic measurements with high spatial and temporal resolution',['X射线磁圆二色','光电子显微谱学成像'],['X-ray magnetic circular dichroism','Photoemission electron microscopy'],[773,801],[626,993]],
    ['原位工况软X射线谱学与散射线站','Operando soft X-ray spectroscopy & scattering',180,2500,'真实反应条件下的高精度电子结构','Electronic structure under realistic reaction conditions',['近常压光电子能谱','共振非弹性散射'],['Near-ambient-pressure photoelectron spectroscopy','Resonant inelastic scattering'],[732,857],[477,979]],
    ['软X射线显微谱学相干成像线站','Soft X-ray spectromicroscopy & coherent imaging',250,2500,'高空间分辨化学成像','High-spatial-resolution chemical imaging',['扫描透射X射线成像','叠层相干衍射成像'],['Scanning transmission X-ray imaging','Ptychographic coherent diffraction imaging'],[346,679],[345,362]],
    ['多尺度时空分辨共振相干散射线站','Multiscale time-resolved resonant coherent scattering',250,4000,'多尺度结构动力学研究','Multiscale structural dynamics',['X射线光子关联谱','软X射线共振散射'],['X-ray photon correlation spectroscopy','Soft X-ray resonant scattering'],[607,920],[341,923]],
    ['高通量原位工况中能谱学线站','High-throughput operando tender X-ray spectroscopy',770,10000,'工况条件器件电子结构','Device electronic structure under operating conditions',['韧X射线光电子能谱','韧X射线吸收/发射谱'],['Tender X-ray photoelectron spectroscopy','Tender X-ray absorption / emission spectroscopy'],[550,399],[813,433]],
    ['中能显微谱学成像线站','Tender X-ray spectromicroscopy',2100,6500,'高空间分辨化学成像','High-spatial-resolution chemical imaging',['X射线显微谱学成像','叠层相干衍射成像'],['X-ray spectromicroscopic imaging','Ptychographic coherent diffraction imaging'],[862,709],[865,938]],
    ['测试光束线站','Test beamline',250,2000,'波动光学、关键光学器件的检测','Wave optics and key optical component testing',['X射线成像'],['X-ray imaging'],[793,770],[715,976]],
  ];
  const world = ([x,y]) => [(x-603)/87, 0, (660-y)/87];
  const beamlines = rows.map((r,i)=>({id:`BL${String(i+1).padStart(2,'0')}`,zh:r[0],en:r[1],min:r[2],max:r[3],advantage:{zh:r[4],en:r[5]},methods:{zh:r[6],en:r[7]},start:world(r[8]),end:world(r[9])}));
  if (typeof module !== 'undefined' && module.exports) module.exports = beamlines;
  else root.HalfBeamlines = beamlines;
})(typeof window !== 'undefined' ? window : globalThis);
