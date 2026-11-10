---
title: "Monitor a Home Server's Disks, RAM and Fans with LogTide"
description: "Install the LogTide hardware agent on a home server, watch SMART, ECC, temperatures and fans in Monitor > Hardware, and get Discord or email alerts."
pubDate: 2026-11-10
author: "Giuseppe Pollio"
tags:
  - "homelab"
  - "hardware"
  - "tutorial"
keywords:
  - "monitor home server hardware"
  - "homelab disk monitoring"
  - "smart monitoring alerts"
  - "monitor ecc memory errors"
  - "self hosted hardware monitoring"
  - "smartmontools discord alerts"
faqs:
  - question: "Does this work for virtual machines?"
    answer: "Not really. A virtual machine sees virtual disks and no hardware sensors, so there is nothing to read. The agent detects this and the host page says so. Install it on the hypervisor host instead, for example the Proxmox node."
  - question: "Can LogTide predict when a disk will fail?"
    answer: "No. It watches the warning signs that hardware reports, such as reallocated sectors, SMART failures, rising temperatures and corrected ECC errors, and alerts you when they appear or grow. About a third of failing disks show no SMART warning at all, so backups are still the real protection."
  - question: "Do I need a BMC or ECC memory?"
    answer: "No. Each collector works on its own. Without a BMC you lose PSU and board sensor data from IPMI, and without ECC memory there are no memory error counters. Disks, CPU temperatures, fans exposed by the motherboard and network cards are still covered."
  - question: "What if the server dies completely?"
    answer: "The host turns stale after 10 minutes without data, but a stale host does not send a notification. Add a heartbeat monitor from Uptime that the server pings every few minutes, and you will be told when it goes silent."
---

Disks, fans and RAM fail quietly, and then all at once. The warning signs are usually there: a few reallocated sectors, a drive running ten degrees hotter than its neighbours, a corrected memory error every few hours. Nobody looks at them because nobody looks at `smartctl` output on a Tuesday.

This guide sets up LogTide to look for you. It starts from nothing and ends with a home server reporting its health to a dashboard and a Discord channel (or your inbox) telling you when something changes. It takes about 20 minutes. The reference for everything used here is the [Hardware Health docs](/docs/hardware-health/).

## What you need

A Linux machine you want to watch, with root access. A Debian or Ubuntu box, a NAS running Linux, a Proxmox node or a spare mini PC all work. Docker is the easiest way to run the agent, but a systemd install works too.

A place to send the data. Either [LogTide Cloud](https://logtide.dev), or your own instance, which needs version 1.7.0 or later. If you have none yet, the next step covers it.

A word on expectations. This is early warning for physical machines. It does not predict failures, and about a third of failing disks never show a SMART warning, so keep your backups. If your server is a virtual machine or a cloud instance, there are no sensors to read; see the FAQ at the end.

## 1. Get a LogTide to talk to

If you use Cloud, create an account and skip to step 2.

To self-host, the stack is a few containers and one command:

```bash
git clone https://github.com/logtide-dev/logtide.git
cd logtide/docker
cp .env.example .env
# edit .env: set DB_PASSWORD, REDIS_PASSWORD and API_KEY_SECRET
docker compose up -d
```

Open `http://localhost:3000`, create your admin account, and you have an empty LogTide. The [getting started guide](/docs/getting-started/) goes through the settings if you want to understand them first.

## 2. Create a project and an API key

In the dashboard, create a project, for example `homelab`. Then open the project settings and create an API key. Copy it somewhere, it is shown once.

A dedicated key for the hardware agents is a good idea. If you ever need to revoke it, nothing else stops working.

## 3. Run the agent

On the server you want to watch, run:

```bash
docker run -d --name logtide-hw-agent --restart unless-stopped --privileged \
  -e LOGTIDE_URL=https://api.logtide.dev \
  -e LOGTIDE_API_KEY=lp_your_key \
  -e HOST_ROOT=/host \
  -v /sys:/host/sys:ro \
  -v /proc:/host/proc:ro \
  -v /etc/hostname:/host/etc/hostname:ro \
  -v logtide-hw-agent-state:/var/lib/logtide-hw-agent \
  logtide/hw-agent:latest
```

Use your own URL and key. For a self-hosted instance, `LOGTIDE_URL` is the address of your API, for example `http://192.168.1.10:8080`.

The container is privileged because reading SMART data, `/dev/kmsg` and the BMC needs raw device access. It only reads. If you would rather not use Docker, the [docs have a systemd install](/docs/hardware-health/#install-systemd) that runs the same single Python file.

If the server is the same machine that runs LogTide, there is a shortcut: put `HW_AGENT_API_KEY=lp_your_key` in `docker/.env` and run `docker compose --profile hardware up -d`.

## 4. Check what the agent can see

Before trusting it, run it once in dry-run mode. This prints what it would send and sends nothing:

```bash
docker run --rm --privileged -e HOST_ROOT=/host -e LOGTIDE_HW_DRY_RUN=1 \
  -v /sys:/host/sys:ro -v /proc:/host/proc:ro -v /etc/hostname:/host/etc/hostname:ro \
  logtide/hw-agent:latest --once
```

You should see `hw.*` metrics scroll past: SMART status for each disk, temperatures, fan speeds if your board exposes them. Collectors that find nothing report status 0. That is normal. A machine without ECC memory has no memory counters, and one without a BMC has no IPMI data.

If nothing about your disks shows up, check that `smartctl -a /dev/sda` works on the host.

## 5. See the host in Monitor > Hardware

Open **Monitor → Hardware** in the dashboard and pick your project. Within a minute or two your server shows up with a status, a chip for each component, and a last seen time.

Click it. The host page has a section for disks, memory, CPU, cooling, power and network, a findings list at the top, and recent hardware events at the bottom. Growth-based checks, such as "reallocated sectors went up this week", need some history, so the first day is mostly about the absolute checks.

A green host means no known warning signs right now. It is not a guarantee.

## 6. Enable the Hardware Health detection pack

The agent also forwards kernel messages that look like hardware problems: I/O errors, SATA link resets, memory errors, PCIe errors, thermal throttling. The Hardware Health detection pack turns those into detections.

Open the detection packs page and enable **Hardware Health**. That is all. The rules match on the message text, so the pack works for any machine whose kernel logs reach LogTide, even without the agent, for example via [syslog](/docs/syslog/) or journald.

## 7. Send alerts to Discord or email

Create a notification destination if you do not have one yet. In **Settings → Notifications**, add a Discord channel by pasting a webhook URL, or an email address if your instance has SMTP configured. [Notification Routing](/docs/notification-routing/) describes the destination types.

Then open **Settings → Notifications → Routing** and set the default destinations for the new **Hardware health** event type. From now on, when a host goes to warning or critical, LogTide opens an incident with source `hardware` and notifies those destinations. When the host recovers, the incident resolves and you get a second message.

If you are about to swap a fan or pull a disk, open the host page and mute it. A muted host is still evaluated, but sends nothing.

## 8. Test it without breaking anything

You do not need a failing disk to see the pipeline work. Send a fake kernel message to your project, shaped like a real disk error:

```bash
curl -X POST https://api.logtide.dev/api/v1/ingest \
  -H "X-API-Key: lp_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "logs": [{
      "service": "hardware",
      "level": "error",
      "message": "blk_update_request: I/O error, dev sdz, sector 12345 op 0x0:(READ)",
      "metadata": { "hw.event.source": "kmsg", "hw.event.type": "disk" }
    }]
  }'
```

Use your own URL and key as before. The log appears in the explorer under the `hardware` service, and the Hardware Health pack raises a detection for it. Your Discord channel or inbox should get the message according to your routing rules. Remember to resolve the test detection afterwards.

You can also stop the agent for ten minutes. The host turns stale on the Hardware page. It does not notify, which leads to the last step.

## 9. Know when the whole server goes dark

Everything above relies on the server being alive enough to report. A dead PSU or a kernel panic stops the data, and a stale host does not send a notification.

For that, create a **heartbeat** monitor in Uptime and have the server ping it every few minutes with a cron job or a systemd timer. If the pings stop, you get an incident and a notification through the normal Uptime route.

## What next

A few ideas once the basics work:

- Install the agent on every physical machine. Each one registers itself by hostname.
- Chart a disk temperature or fan speed on a [custom dashboard](/docs/dashboards/) with a `metric_chart` panel. The metrics are plain OTLP.
- Read the [health rules](/docs/hardware-health/#health-rules) to see exactly when a host turns warning or critical.
- Check the [troubleshooting section](/docs/hardware-health/#troubleshooting) if a collector shows as unavailable.

And keep your backups. LogTide can tell you a disk is sick, it cannot bring the data back.
