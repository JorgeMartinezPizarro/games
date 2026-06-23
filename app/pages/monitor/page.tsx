'use client'

import React, { useState } from 'react';
import { Button } from "@mui/material";
import "./styles.css";
import LoginIcon from '@mui/icons-material/Login';
import {useStats} from '@/app/hooks/useStats';
import { Chart } from '@/app/components/Chart';

const Monitor = () => {

	const messages = useStats();

	const [showDocker, setShowDocker] = useState(false);
	const [showProjects, setShowProjects] = useState(false);
	
	const dockerProjects = (messages["docker.json"]?.content ?? []).reduce((acc: any, item: any) => {
		const projectName = item.name?.split("-")[0];
		if (acc[projectName]) acc[projectName].push(item);
		else acc[projectName] = [item];
		return acc;
	}, {} as Record<string, any[]>)

	const cores = messages["system.json"]?.content?.resources?.cpu?.cores || 1
	
	const attackers = messages["access.json"]?.content?.fails
		?.filter((row: any) => !messages["access.json"]?.content?.banned_ips?.includes(row.ip))
		
	return (
    <div className="my-frame">
		{messages["system.json"]?.content && messages["docker.json"]?.content && (
			<div className="my-grid">
					<p className="my-chart">{messages["system.json"].content.model}</p>
					<Chart label="CPU" value={messages["system.json"]?.content?.summary?.cpu_usage || 0} />
					<Chart label="RAM" value={messages["system.json"]?.content?.summary?.ram_usage || 0} />
					<Chart label="DISK" value={messages["system.json"]?.content?.summary?.disk_usage || 0} />
					<p><Button onClick={() => {setShowProjects(!showProjects)}} className="my-chart my-button">{Object.keys(dockerProjects).length} - projects running.</Button></p>
					{Object.keys(dockerProjects).map((row: any, id: number) => {
						const sumMem = dockerProjects[row].reduce((acc: number, item: any) => {
							return acc + parseFloat(item.memory?.replace("%", "") ?? "0");
						}, 0)
						const sumCPU = dockerProjects[row].reduce((acc: number, item: any) => {
							return acc + parseFloat(item.cpu?.replace("%", "") ?? "0");
						}, 0)
						let truncatedMem = Math.floor(sumMem * 100) / 100;
						let truncatedCPU = Math.floor(sumCPU / cores * 100) / 100;
						return <div key={id} className="my-chart" style={{display: showProjects ? "block" : "none"}}>
							<div className="project-line">
								<div className="name">{row} ({dockerProjects[row].length})</div>
								<div className="bar cpu"><div className="fill" style={{width: truncatedCPU + "%"}}></div></div>
								<div className="bar ram"><div className="fill" style={{width: truncatedMem + "%"}}></div></div>
							</div>
						</div>						
					})}
					<p>
						<Button onClick={
							() => {setShowDocker(!showDocker)}
						} className="my-chart my-button">
							{messages["docker.json"]?.content?.length ?? 0} - containers running.
						</Button>
					</p>
					{messages["docker.json"].content.map((row: any, id: number) => {
						let rawStatus = row.status;
						if (!rawStatus.includes("("))
							rawStatus = rawStatus + " 🟢"
						const status = rawStatus.replace("Up ", "").replace("(unhealthy)", "🔴").replace("(healthy)", "🟢").replace("(Paused)", "🟡");
						return <div key={id} className="my-chart" style={{display: showDocker ? "block" : "none"}}>
						<div style={{marginLeft: "5%", display: "inline-block", width: "45%", textAlign: "left"}}>
							{row.name}
						</div>
						<div style={{marginRight: "5%", display: "inline-block", width: "45%", textAlign: "right"}}>
							{status}
						</div>
						</div>
					})}
			</div>
		)}

		

		{messages["access.json"]?.content && (
				<div className="my-grid">
						{messages["access.json"]?.content?.login?.map((row: any, id: number) => 
							<p className="my-chart" key={id}>
								✅ {row.ip} {row.count} times
							</p>
						)}
						{attackers
							.map((row: any, id: number) => 
								<p className="my-chart" key={id}>
									❌ {row.ip} {row.count} times
								</p>
						)}
					
					<div>
						<Button
							variant="outlined"
							className="my-button my-chart"
							disabled={
								(attackers.length || 0) === 0
							}
							onClick={() => {
								const elements = attackers.map(
									(value: any) => `iptables -A INPUT -s ${value.ip} -j DROP`
								) ?? []
								const script = elements.join(" && ")
								navigator.clipboard.writeText(script)
							}}
						>
							Copy script to ban ips {messages["access.json"]?.content?.fails
								?.filter((row: any) => !messages["access.json"]?.content?.banned_ips?.includes(row.ip))
								.length ?? 0}
						</Button>
						<p className="my-chart">{messages["access.json"]?.content?.banned_ips?.length ?? 0} banned IPs so far</p>
					</div>
				</div>
		)}
	</div>
	)
};

export default Monitor;
