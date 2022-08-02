#!/usr/bin/env node
/* eslint-disable no-console */

// @ts-check
import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { exit } from 'node:process'
import minimist from 'minimist'
import prompts from 'prompts'
import ora from 'ora'
import {
  blue,
  green,
  magenta,
  red,
  reset,
  yellow,
} from 'kolorist'

const argv = minimist(process.argv.slice(2), { string: ['_'] })
const cwd = process.cwd()

const OWNERS = [
  {
    name: 'antfu',
    color: yellow,
    variants: [
      {
        name: 'vitesse',
        color: yellow,
        value: 'git@github.com:antfu/vitesse.git',
      },
      {
        name: 'vitesse-lite',
        color: blue,
        value: 'git@github.com:antfu/vitesse-lite.git',
      },
      {
        name: 'starter-ts',
        color: magenta,
        value: 'git@github.com:antfu/starter-ts.git',
      },
    ],
  },
  // TODO: chinbor的小程序跟web端模板的抽离
  {
    name: 'chinbor',
    color: yellow,
    variants: [
      {
        name: 'starter-wechat',
        color: yellow,
        value: 'git@github.com:chinbor/starter-wechat-applet.git',
      },
    ],
  },
]

// gradient-string to print
// console.dir(gradient.vice('Create-cp —— The quickly build project tools'))
// Use the output directly here to keep the bundle small.
const banner = '\x1B[38;2;94;231;223mC\x1B[39m\x1B[38;2;96;230;228mr\x1B[39m\x1B[38;2;97;225;229me\x1B[39m\x1B[38;2;99;219;229ma\x1B[39m\x1B[38;2;100;212;228mt\x1B[39m\x1B[38;2;102;206;227me\x1B[39m\x1B[38;2;103;200;226m-\x1B[39m\x1B[38;2;105;194;225mc\x1B[39m\x1B[38;2;106;189;225mp\x1B[39m \x1B[38;2;108;183;224m—\x1B[39m\x1B[38;2;109;178;223m—\x1B[39m \x1B[38;2;111;173;222mT\x1B[39m\x1B[38;2;112;168;222mh\x1B[39m\x1B[38;2;114;164;221me\x1B[39m \x1B[38;2;115;159;220mq\x1B[39m\x1B[38;2;116;155;219mu\x1B[39m\x1B[38;2;118;151;218mi\x1B[39m\x1B[38;2;119;147;218mc\x1B[39m\x1B[38;2;121;144;217mk\x1B[39m\x1B[38;2;122;140;216ml\x1B[39m\x1B[38;2;123;137;215my\x1B[39m \x1B[38;2;125;134;215mb\x1B[39m\x1B[38;2;126;131;214mu\x1B[39m\x1B[38;2;127;128;213mi\x1B[39m\x1B[38;2;131;128;212ml\x1B[39m\x1B[38;2;136;130;211md\x1B[39m \x1B[38;2;141;131;211mp\x1B[39m\x1B[38;2;145;132;210mr\x1B[39m\x1B[38;2;150;133;209mo\x1B[39m\x1B[38;2;154;135;208mj\x1B[39m\x1B[38;2;158;136;207me\x1B[39m\x1B[38;2;161;137;207mc\x1B[39m\x1B[38;2;165;138;206mt\x1B[39m \x1B[38;2;168;139;205mt\x1B[39m\x1B[38;2;171;141;204mo\x1B[39m\x1B[38;2;175;142;204mo\x1B[39m\x1B[38;2;177;143;203ml\x1B[39m\x1B[38;2;180;144;202ms\x1B[39m'

// 存在 variants 以及不存在 variants 但是存在 value 的都是模板！
const TEMPLATES = {}

const lockFiles = ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json']

// {
//   vitesse: 'git@github.com:antfu/vitesse.git',
//   'vitesse-lite': 'git@github.com:antfu/vitesse-lite.git',
//   'starter-ts': 'git@github.com:antfu/starter-ts.git',
//   chinbor: 'chinborasd'
// }
function getTemplates(owners) {
  if (owners && owners.length) {
    owners.forEach((owner) => {
      // 存在value的才是模板
      if (owner.value)
        TEMPLATES[owner.name] = owner.value

      getTemplates(owner.variants)
    })
  }
}

async function init() {
  getTemplates(OWNERS)

  console.log(`\n${banner}\n`)

  let targetDir = formatTargetDir(argv._[0])
  let template = argv.template || argv.t

  const defaultTargetDir = 'cp-project'
  const getProjectName = () =>
    targetDir === '.' ? path.basename(path.resolve()) : targetDir

  let result = {}

  try {
    result = await prompts(
      [
        {
          // 项目名
          type: targetDir ? null : 'text',
          name: 'projectName',
          message: reset('Project name:'),
          initial: defaultTargetDir,
          onState: (state) => {
            targetDir = formatTargetDir(state.value) || defaultTargetDir
          },
        },
        {
          // 是否当前./目录 以及是否存在同名的非空目录（后续根据）overwrite是true还是false决定是否删除其下文件
          type: () =>
            !fs.existsSync(targetDir) || isEmpty(targetDir) ? null : 'confirm',
          name: 'overwrite',
          message: () =>
          `${targetDir === '.'
            ? 'Current directory'
            : `Target directory "${targetDir}"`
          } is not empty. Remove existing files and continue?`,
        },
        {
          // 判断是否重写
          // @ts-expect-error let me do it
          type: (_, { overwrite } = {}) => {
            if (overwrite === false)
              throw new Error(`${red('✖')} Operation cancelled`)

            return null
          },
          name: 'overwriteChecker',
        },
        {
          // 包名
          type: () => (isValidPackageName(getProjectName()) ? null : 'text'),
          name: 'packageName',
          message: reset('Package name:'),
          initial: () => toValidPackageName(getProjectName()),
          validate: dir =>
            isValidPackageName(dir) || 'Invalid package.json name',
        },
        {
          // 选择是哪个拥有者
          type: template && TEMPLATES[template] ? null : 'select',
          name: 'owner',
          message:
          typeof template === 'string' && !TEMPLATES[template]
            ? reset(
                `"${template}" isn't a valid template. Please choose from below: `,
            )
            : reset('Select a owner:'),
          initial: 0,
          choices: OWNERS.map((owner) => {
            const frameworkColor = owner.color
            return {
              title: frameworkColor(owner.name),
              value: owner,
            }
          }),
        },
        {
          type: owner =>
            owner && owner.variants ? 'select' : null,
          name: 'framework',
          message: reset('Select a framework:'),
          choices: owner =>
            owner.variants.map((variant) => {
              const variantColor = variant.color
              return {
                title: variantColor(variant.name),
                value: variant.value,
              }
            }),
        },
      ],
      {
        onCancel: () => {
          throw new Error(`${red('✖')} Operation cancelled`)
        },
      },
    )
  }
  catch (cancelled) {
    console.log(cancelled.message)
    return
  }

  const { owner, overwrite, packageName, framework } = result

  const root = path.join(cwd, targetDir)

  // 存在同名的非空目录以及是.当前目录那么需要清空目录下文件！！
  if (overwrite)
    emptyDir(root)

  let command = 'git clone'

  // NOTE: 判断owner下是否存在variants（可以提交一个issues）
  template = framework || (owner && owner.value) || TEMPLATES[template]

  command += ` ${template} ${targetDir}`

  const spinner = ora('Downloading from remote repo, please wait a moment...').start()

  const stopAndExit = (child, text) => {
    spinner.stopAndPersist({
      symbol: red('×'),
      text,
    })
    // 杀死子进程（此时还在下载）
    child.kill()
    // 主进程主动退出（0代表成功）
    exit(1)
  }

  // 不要使用execSync ，会阻塞nodejs的事件循环导致spinner效果失效
  const child = exec(command, (err) => {
    // console.log(stderr)
    if (err)
      stopAndExit(child, 'something wrong')

    spinner.stopAndPersist({
      symbol: green('√'),
      text: 'Downloaded',
    })

    const pkgPath = path.join(root, 'package.json')

    const pkg = JSON.parse(
      fs.readFileSync(pkgPath, 'utf-8'),
    )

    pkg.name = packageName || getProjectName()

    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))

    const rootDirs = fs.readdirSync(root)

    const lockFile = rootDirs.filter((fileName) => {
      return ~lockFiles.indexOf(fileName)
    })[0]

    const getPkgManager = () => {
      if (lockFile === lockFiles[0])
        return 'pnpm'

      if (lockFile === lockFiles[1])
        return 'yarn'

      if (lockFile === lockFiles[2])
        return 'npm'
    }

    let pkgManager = ''

    if (lockFile) {
      const name = getPkgManager()

      if (name)
        pkgManager = name
    }
    else {
      const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent)
      pkgManager = pkgInfo ? pkgInfo.name : 'npm'
    }

    console.log(`\n${blue('Done. Now run:')}\n`)

    if (root !== cwd)
      console.log(`${blue(`  cd ${path.relative(cwd, root)}`)}`)

    switch (pkgManager) {
      case 'yarn':
        console.log(`${blue('  yarn')}`)
        console.log(`${blue('  yarn dev')}`)
        break
      default:
        console.log(`${blue(`  ${pkgManager} install`)}`)
        console.log(`${blue(`  ${pkgManager} run dev`)}`)
        break
    }

    console.log()
  })

  // 监听 ctrl + d ctrl + c
  process.on('SIGINT', () => {
    stopAndExit(child, 'Downloading abort')
  })
}

function formatTargetDir(targetDir) {
  return targetDir?.trim().replace(/\/+$/g, '')
}

function isEmpty(path) {
  const files = fs.readdirSync(path)

  return files.length === 0 || (files.length === 1 && files[0] === '.git')
}

function isValidPackageName(projectName) {
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(
    projectName,
  )
}

function toValidPackageName(projectName) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z0-9-~]+/g, '-')
}

function emptyDir(dir) {
  if (!fs.existsSync(dir))
    return

  for (const file of fs.readdirSync(dir))
    fs.rmSync(path.resolve(dir, file), { recursive: true, force: true })
}

function pkgFromUserAgent(userAgent) {
  if (!userAgent)
    return undefined
  const pkgSpec = userAgent.split(' ')[0]
  const pkgSpecArr = pkgSpec.split('/')
  return {
    name: pkgSpecArr[0],
    version: pkgSpecArr[1],
  }
}

init().catch((e) => {
  console.error(e)
})
