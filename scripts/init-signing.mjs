import {randomBytes} from 'node:crypto';
import {chmodSync,existsSync,lstatSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export function initializeSigning(projectRoot=fileURLToPath(new URL('../',import.meta.url))){
  const directory=join(projectRoot,'.signing');
  const keystore=join(directory,'music-release.p12'),properties=join(directory,'release.properties');
  if(existsSync(directory)&&(!lstatSync(directory).isDirectory()||lstatSync(directory).isSymbolicLink()))throw new Error('.signing 必须是本机目录，不能是符号链接。');
  if(existsSync(keystore)||existsSync(properties))throw new Error('签名文件已存在，未覆盖。请保留并备份原密钥；更换密钥会影响应用升级。');
  const probe=spawnSync('keytool',['-help'],{stdio:'ignore'});
  if(probe.error||probe.status!==0)throw new Error('未找到可用的 keytool，请安装 JDK 并配置 PATH。');
  const password=randomBytes(32).toString('hex');
  mkdirSync(directory,{recursive:true,mode:0o700});
  chmodSync(directory,0o700);
  // Persist credentials first so an interrupted key generation cannot lose its password.
  writeFileSync(properties,`storeFile=music-release.p12\nstorePassword=${password}\nkeyAlias=music-release\nkeyPassword=${password}\n`,{mode:0o600,flag:'wx'});
  const result=spawnSync('keytool',[
    '-genkeypair','-keystore',keystore,'-storetype','PKCS12',
    '-alias','music-release','-keyalg','RSA','-keysize','3072',
    '-sigalg','SHA256withRSA','-validity','10000',
    '-dname','CN=app.xvi.music','-noprompt',
    '-storepass:env','MUSIC_RELEASE_STORE_PASSWORD','-keypass:env','MUSIC_RELEASE_KEY_PASSWORD',
  ],{env:{...process.env,MUSIC_RELEASE_STORE_PASSWORD:password,MUSIC_RELEASE_KEY_PASSWORD:password},stdio:'ignore'});
  if(result.error||result.status!==0)throw new Error('生成签名密钥失败。凭据已保存在 .signing/release.properties，请保留该文件并检查 JDK。');
  // keytool uses the process umask, so explicitly restrict the generated private key.
  chmodSync(keystore,0o600);
  return {directory,keystore,properties};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const result=initializeSigning();
    console.log('已创建 .signing/music-release.p12 和 .signing/release.properties。');
    console.log('请安全备份整个 .signing 目录；它不进入 Git，密码不会输出到终端。');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
